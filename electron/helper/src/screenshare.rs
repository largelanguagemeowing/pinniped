//! System audio for screen shares on Linux: a virtual PipeWire microphone that carries the audio
//! of every other application but not Pinniped's own, so the call and the soundboard never echo
//! back into the share. Chromium's getDisplayMedia() cannot capture system audio on Linux, so the
//! call widget opens this virtual microphone and publishes it as the share's audio track.
//!
//! The device and its links are objects this helper creates on its own PipeWire connection, not
//! lingering ones, so PipeWire removes them when the helper exits, however it exits.
//!
//! The PipeWire loop is driven from the helper's tokio loop: [`ScreenShare::readable`] waits for
//! its fd and [`ScreenShare::dispatch`] runs it. Callbacks only record what changed in [`State`];
//! links are made afterwards, in [`ScreenShare::dispatch`], once the batch of events is in.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::os::fd::{AsRawFd, RawFd};
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use pipewire as pw;
use pw::link::Link;
use pw::metadata::{Metadata, MetadataListener};
use pw::node::{Node, NodeListener};
use pw::proxy::{ProxyListener, ProxyT};
use pw::registry::GlobalObject;
use pw::spa::utils::dict::DictRef;
use pw::spa::utils::result::AsyncSeq;
use pw::types::ObjectType;
use tokio::io::unix::AsyncFd;

/// The device's node name, unique to Pinniped.
const DEVICE_NAME: &str = "pinniped-screenshare";
/// Shown as the device's name; the call widget finds the device by it
/// (`SCREEN_SHARE_AUDIO_DEVICE` in src/app/plugins/call/types.ts).
const DEVICE_LABEL: &str = "Pinniped Screen Share Audio";

type Error = Box<dyn std::error::Error>;

#[derive(Default)]
pub struct ScreenShare {
    conn: Option<Connection>,
}

impl ScreenShare {
    /// Creates the virtual microphone, connecting to PipeWire first if needed. Resolves once
    /// PipeWire has made the device, so the widget can find it from then on.
    pub async fn prepare(&mut self) -> Result<(), Error> {
        if self.conn.is_none() {
            self.conn = Some(Connection::new()?);
        }
        let conn = self.conn.as_mut().expect("connection was just made");
        if conn.state.borrow().source.is_some() {
            return Ok(());
        }
        conn.create_source()?;
        if let Err(err) = conn.roundtrip().await {
            self.conn = None;
            return Err(err);
        }
        let mut state = conn.state.borrow_mut();
        if state.source_id.is_none() {
            state.source = None;
            let error = state.source_error.take();
            return Err(error
                .unwrap_or_else(|| "PipeWire did not create the device".into())
                .into());
        }
        Ok(())
    }

    /// Starts or stops feeding other applications' audio into the device. Only what is played to
    /// the output device labelled `output` (the system default when empty) is fed in.
    pub fn link(&mut self, active: bool, output: String) -> Result<(), Error> {
        let Some(conn) = self.conn.as_mut() else {
            return if active {
                Err("the screen share audio device is not prepared".into())
            } else {
                Ok(())
            };
        };
        {
            let mut state = conn.state.borrow_mut();
            state.output = active.then_some(output);
            state.dirty = true;
        }
        conn.apply();
        Ok(())
    }

    /// Removes the device and every link to it by closing the connection.
    pub fn release(&mut self) {
        self.conn = None;
    }

    /// Waits until PipeWire has events for us. Never resolves while there is no connection.
    pub async fn readable(&self) {
        match &self.conn {
            Some(conn) => conn
                .fd
                .readable()
                .await
                .map(|mut guard| guard.clear_ready())
                .unwrap_or(()),
            None => std::future::pending().await,
        }
    }

    /// Handles PipeWire's pending events and brings the links up to date.
    pub fn dispatch(&mut self) {
        let Some(conn) = self.conn.as_mut() else {
            return;
        };
        conn.iterate();
        if conn.state.borrow().disconnected {
            eprintln!("PipeWire closed the connection; screen share audio stopped");
            self.conn = None;
            return;
        }
        conn.apply();
    }
}

/// What the callbacks learn about the PipeWire graph, plus the objects we own in it.
#[derive(Default)]
struct State {
    nodes: HashMap<u32, NodeEntry>,
    ports: HashMap<u32, PortEntry>,
    links: HashMap<u32, LinkEntry>,
    default_sink: Option<String>,

    /// Globals to bind once the current batch of events is handled.
    to_bind: Vec<GlobalObject<pw::properties::PropertiesBox>>,
    /// Application streams we listen to for their process id.
    streams: HashMap<u32, Bound<Node, NodeListener>>,
    default_metadata: Option<Bound<Metadata, MetadataListener>>,
    /// Proxies to drop once no callback is running.
    dead: Vec<Box<dyn std::any::Any>>,

    source: Option<Bound<Node, ProxyListener>>,
    /// The device's proxy id, which PipeWire's errors about it carry.
    source_proxy: Option<u32>,
    /// The device's global id, once PipeWire made it.
    source_id: Option<u32>,
    source_error: Option<String>,
    /// Our links into the device, by (output port, input port).
    own_links: HashMap<(u32, u32), Link>,
    /// The output device label while linking, None while not.
    output: Option<String>,
    dirty: bool,

    synced: Option<AsyncSeq>,
    disconnected: bool,
}

struct NodeEntry {
    name: Option<String>,
    description: Option<String>,
    nick: Option<String>,
    media_class: Option<String>,
    /// The owning process, once the node's info arrived; `Some(None)` when it has none.
    pid: Option<Option<u32>>,
}

struct PortEntry {
    node: u32,
    output: bool,
    channel: Option<String>,
}

struct LinkEntry {
    output_node: u32,
    output_port: u32,
    input_port: u32,
}

/// A proxy with its listener. The listener is declared first so it is removed before the proxy.
struct Bound<P, L> {
    _listener: L,
    _proxy: P,
}

/// The PipeWire loop's fd, owned by the loop.
struct LoopFd(RawFd);
impl AsRawFd for LoopFd {
    fn as_raw_fd(&self) -> RawFd {
        self.0
    }
}

/// One PipeWire connection. Fields drop in order: the proxies in `state` go before the registry and
/// core they came from, and the loop goes last.
struct Connection {
    fd: AsyncFd<LoopFd>,
    state: Rc<RefCell<State>>,
    _registry_listener: pw::registry::Listener,
    _core_listener: pw::core::Listener,
    registry: pw::registry::RegistryRc,
    core: pw::core::CoreRc,
    _context: pw::context::ContextRc,
    loop_: pw::loop_::LoopRc,
}

fn prop(props: Option<&DictRef>, key: &str) -> Option<String> {
    props.and_then(|p| p.get(key)).map(str::to_owned)
}

fn prop_id(props: Option<&DictRef>, key: &str) -> Option<u32> {
    props.and_then(|p| p.get(key)).and_then(|v| v.parse().ok())
}

impl Connection {
    fn new() -> Result<Self, Error> {
        pw::init();
        let loop_ = pw::loop_::LoopRc::new(None)?;
        let context = pw::context::ContextRc::new(&loop_, None)?;
        let core = context.connect_rc(None)?;
        let registry = core.get_registry_rc()?;
        let state = Rc::new(RefCell::new(State::default()));

        let weak = Rc::downgrade(&state);
        let core_listener = core
            .add_listener_local()
            .done({
                let weak = weak.clone();
                move |id, seq| {
                    if id != pw::core::PW_ID_CORE {
                        return;
                    }
                    if let Some(state) = weak.upgrade() {
                        state.borrow_mut().synced = Some(seq);
                    }
                }
            })
            .error({
                let weak = weak.clone();
                move |id, _seq, res, message| {
                    let Some(state) = weak.upgrade() else { return };
                    let mut state = state.borrow_mut();
                    let broken = std::io::Error::from_raw_os_error(-res).kind()
                        == std::io::ErrorKind::BrokenPipe;
                    if id == pw::core::PW_ID_CORE && broken {
                        state.disconnected = true;
                    } else if state.source_proxy == Some(id) {
                        state.source_error = Some(message.to_owned());
                    }
                    eprintln!("PipeWire error on object {id}: {message}");
                }
            })
            .register();

        let registry_listener = registry
            .add_listener_local()
            .global({
                let weak = weak.clone();
                move |global| {
                    if let Some(state) = weak.upgrade() {
                        state.borrow_mut().add_global(global);
                    }
                }
            })
            .global_remove({
                let weak = weak.clone();
                move |id| {
                    if let Some(state) = weak.upgrade() {
                        state.borrow_mut().remove_global(id);
                    }
                }
            })
            .register();

        // SAFETY: the fd belongs to `loop_`, which `Connection` drops after `fd` (field order), so
        // it stays open and unchanged for the AsyncFd's whole life.
        let fd = unsafe { AsyncFd::register(LoopFd(loop_.fd().as_raw_fd())) }
            .map_err(std::io::Error::from)?;
        Ok(Self {
            fd,
            state,
            _registry_listener: registry_listener,
            _core_listener: core_listener,
            registry,
            core,
            _context: context,
            loop_,
        })
    }

    fn create_source(&mut self) -> Result<(), Error> {
        let node: Node = self.core.create_object(
            "adapter",
            &pw::properties::properties! {
                "factory.name" => "support.null-audio-sink",
                "node.name" => DEVICE_NAME,
                "node.description" => DEVICE_LABEL,
                "media.class" => "Audio/Source/Virtual",
                "audio.position" => "[ FL FR ]",
                "object.linger" => "false",
            },
        )?;
        let weak = Rc::downgrade(&self.state);
        let listener = node
            .upcast_ref()
            .add_listener_local()
            .bound(move |id| {
                if let Some(state) = weak.upgrade() {
                    let mut state = state.borrow_mut();
                    state.source_id = Some(id);
                    state.dirty = true;
                }
            })
            .register();
        let mut state = self.state.borrow_mut();
        state.source_proxy = Some(node.upcast_ref().id());
        state.source = Some(Bound {
            _listener: listener,
            _proxy: node,
        });
        state.source_id = None;
        state.source_error = None;
        Ok(())
    }

    /// Waits until PipeWire has handled everything sent so far.
    async fn roundtrip(&mut self) -> Result<(), Error> {
        let seq = self.core.sync(0)?;
        let wait = async {
            loop {
                self.iterate();
                let state = self.state.borrow();
                if state.disconnected {
                    return Err::<(), Error>("PipeWire closed the connection".into());
                }
                if state.synced == Some(seq) {
                    return Ok(());
                }
                drop(state);
                if let Ok(mut guard) = self.fd.readable().await {
                    guard.clear_ready();
                }
            }
        };
        tokio::time::timeout(Duration::from_secs(5), wait)
            .await
            .map_err(|_| "PipeWire did not answer")?
    }

    /// Runs every event PipeWire has queued, then binds what the callbacks asked for.
    fn iterate(&mut self) {
        while self.loop_.iterate(pw::loop_::Timeout::None) > 0 {}
        let (to_bind, dead) = {
            let mut state = self.state.borrow_mut();
            (
                std::mem::take(&mut state.to_bind),
                std::mem::take(&mut state.dead),
            )
        };
        drop(dead);
        for global in to_bind {
            self.bind(&global);
        }
    }

    fn bind(&mut self, global: &GlobalObject<pw::properties::PropertiesBox>) {
        let weak = Rc::downgrade(&self.state);
        let id = global.id;
        match global.type_ {
            ObjectType::Node => {
                let Ok(node) = self.registry.bind::<Node, _>(global) else {
                    return;
                };
                let listener = node
                    .add_listener_local()
                    .info(move |info| {
                        let Some(state) = weak.upgrade() else { return };
                        let mut state = state.borrow_mut();
                        let pid = prop_id(info.props(), "application.process.id");
                        if let Some(node) = state.nodes.get_mut(&id) {
                            node.pid = Some(pid);
                        }
                        state.dirty = true;
                    })
                    .register();
                self.state.borrow_mut().streams.insert(
                    id,
                    Bound {
                        _listener: listener,
                        _proxy: node,
                    },
                );
            }
            ObjectType::Metadata => {
                let Ok(metadata) = self.registry.bind::<Metadata, _>(global) else {
                    return;
                };
                let listener = metadata
                    .add_listener_local()
                    .property(move |subject, key, _type, value| {
                        let Some(state) = weak.upgrade() else {
                            return 0;
                        };
                        let mut state = state.borrow_mut();
                        if subject == pw::core::PW_ID_CORE
                            && matches!(key, None | Some("default.audio.sink"))
                        {
                            // The value is JSON: {"name":"<node.name>"}. No key clears everything.
                            state.default_sink = key.and(value).and_then(|v| {
                                let v: serde_json::Value = serde_json::from_str(v).ok()?;
                                v.get("name")?.as_str().map(str::to_owned)
                            });
                            state.dirty = true;
                        }
                        0
                    })
                    .register();
                self.state.borrow_mut().default_metadata = Some(Bound {
                    _listener: listener,
                    _proxy: metadata,
                });
            }
            _ => {}
        }
    }

    /// Makes our links match what should be shared: every other application's output that is
    /// played to the output device, linked channel by channel into the virtual microphone.
    fn apply(&mut self) {
        let mut state = self.state.borrow_mut();
        if !std::mem::take(&mut state.dirty) {
            return;
        }
        let wanted = match (&state.output, state.source_id) {
            (Some(output), Some(source)) => state.wanted_links(output, source),
            _ => HashSet::new(),
        };

        // Streams that stopped qualifying, because they moved to another device or ended, lose
        // their link; dropping a link proxy removes the link.
        state.own_links.retain(|pair, _| wanted.contains(pair));

        let existing: HashSet<(u32, u32)> = state
            .links
            .values()
            .map(|l| (l.output_port, l.input_port))
            .collect();
        for &(out, inp) in &wanted {
            if state.own_links.contains_key(&(out, inp)) || existing.contains(&(out, inp)) {
                continue;
            }
            let link = self.core.create_object::<Link>(
                "link-factory",
                &pw::properties::properties! {
                    "link.output.port" => out.to_string(),
                    "link.input.port" => inp.to_string(),
                    "object.linger" => "false",
                },
            );
            match link {
                Ok(link) => {
                    state.own_links.insert((out, inp), link);
                }
                Err(err) => eprintln!("could not link port {out} to {inp}: {err}"),
            }
        }
    }
}

impl State {
    fn add_global(&mut self, global: &GlobalObject<&DictRef>) {
        let props = global.props;
        match global.type_ {
            ObjectType::Node => {
                let media_class = prop(props, "media.class");
                // Only application streams carry the process id we need, and only in their info.
                if media_class.as_deref() == Some("Stream/Output/Audio") {
                    self.to_bind.push(global.to_owned());
                }
                self.nodes.insert(
                    global.id,
                    NodeEntry {
                        name: prop(props, "node.name"),
                        description: prop(props, "node.description"),
                        nick: prop(props, "node.nick"),
                        media_class,
                        pid: None,
                    },
                );
            }
            ObjectType::Port => {
                let Some(node) = prop_id(props, "node.id") else {
                    return;
                };
                self.ports.insert(
                    global.id,
                    PortEntry {
                        node,
                        output: prop(props, "port.direction").as_deref() == Some("out"),
                        channel: prop(props, "audio.channel"),
                    },
                );
            }
            ObjectType::Link => {
                let (Some(output_node), Some(output_port), Some(input_port)) = (
                    prop_id(props, "link.output.node"),
                    prop_id(props, "link.output.port"),
                    prop_id(props, "link.input.port"),
                ) else {
                    return;
                };
                self.links.insert(
                    global.id,
                    LinkEntry {
                        output_node,
                        output_port,
                        input_port,
                    },
                );
            }
            ObjectType::Metadata => {
                if prop(props, "metadata.name").as_deref() == Some("default") {
                    self.to_bind.push(global.to_owned());
                }
            }
            _ => return,
        }
        self.dirty = true;
    }

    fn remove_global(&mut self, id: u32) {
        self.nodes.remove(&id);
        self.ports.remove(&id);
        self.links.remove(&id);
        if let Some(stream) = self.streams.remove(&id) {
            self.dead.push(Box::new(stream));
        }
        self.dirty = true;
    }

    /// The playback device Pinniped is set to use: the sink whose description or nick is the
    /// label Chromium shows for it, else the system default sink.
    fn output_node(&self, label: &str) -> Option<u32> {
        let sinks = || {
            self.nodes
                .iter()
                .filter(|(_, n)| n.media_class.as_deref() == Some("Audio/Sink"))
        };
        let named = (!label.is_empty())
            .then(|| {
                sinks().find(|(_, n)| {
                    n.description.as_deref() == Some(label) || n.nick.as_deref() == Some(label)
                })
            })
            .flatten();
        named
            .or_else(|| {
                let default = self.default_sink.as_deref()?;
                sinks().find(|(_, n)| n.name.as_deref() == Some(default))
            })
            .map(|(&id, _)| id)
    }

    fn wanted_links(&self, output: &str, source: u32) -> HashSet<(u32, u32)> {
        let mut wanted = HashSet::new();
        let source_in: HashMap<&str, u32> = self
            .ports
            .iter()
            .filter(|(_, p)| p.node == source && !p.output)
            .filter_map(|(&id, p)| Some((p.channel.as_deref()?, id)))
            .collect();
        if source_in.is_empty() {
            return wanted;
        }

        // Only what is played to Pinniped's output device is shared. With virtual audio routing
        // an application feeds a virtual device and a loopback forwards it to the real one;
        // capturing both would send the sound twice, so only streams that reach the output device
        // itself count.
        let Some(output) = self.output_node(output) else {
            return wanted;
        };
        let output_ports: HashSet<u32> = self
            .ports
            .iter()
            .filter(|(_, p)| p.node == output)
            .map(|(&id, _)| id)
            .collect();
        let reaches_output: HashSet<u32> = self
            .links
            .values()
            .filter(|l| output_ports.contains(&l.input_port))
            .map(|l| l.output_node)
            .collect();

        let own = OwnProcesses::new();
        for (&node_id, node) in &self.nodes {
            if node.media_class.as_deref() != Some("Stream/Output/Audio")
                || !reaches_output.contains(&node_id)
            {
                continue;
            }
            // Wait for the node's info before deciding; a stream without a process id is shared.
            match node.pid {
                None => continue,
                Some(Some(pid)) if own.contains(pid) => continue,
                _ => {}
            }
            for (&port_id, port) in &self.ports {
                if port.node != node_id || !port.output {
                    continue;
                }
                // A mono stream feeds both sides.
                match port.channel.as_deref().and_then(|c| source_in.get(c)) {
                    Some(&target) => {
                        wanted.insert((port_id, target));
                    }
                    None => wanted.extend(source_in.values().map(|&target| (port_id, target))),
                }
            }
        }
        wanted
    }
}

/// Pinniped's own processes: the Electron main process that started this helper and every
/// descendant running the same executable. Chromium plays audio from a child process (the audio
/// service), so the main process alone is not enough, and a program Pinniped merely launched
/// (a browser opening a link) runs another executable and still counts as another application.
struct OwnProcesses {
    root: u32,
    exe: Option<PathBuf>,
}

impl OwnProcesses {
    fn new() -> Self {
        let root = std::os::unix::process::parent_id();
        Self {
            root,
            exe: exe(root),
        }
    }

    fn contains(&self, pid: u32) -> bool {
        if self.exe.is_none() || exe(pid) != self.exe {
            return false;
        }
        let mut current = pid;
        // The depth bound guards against a cycle from a pid reused while we walk.
        for _ in 0..64 {
            if current == self.root {
                return true;
            }
            match parent(current) {
                Some(p) if p > 1 => current = p,
                _ => return false,
            }
        }
        false
    }
}

fn exe(pid: u32) -> Option<PathBuf> {
    std::fs::read_link(format!("/proc/{pid}/exe")).ok()
}

fn parent(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // The command name is in parentheses and may contain spaces; the fields after it are
    // "<state> <ppid> ...".
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Child, Command};

    fn own() -> OwnProcesses {
        let root = std::process::id();
        OwnProcesses {
            root,
            exe: exe(root),
        }
    }

    /// Runs this test binary again as a child that just waits, standing in for a Chromium child
    /// process: a descendant running the same executable.
    fn same_exe_child() -> Child {
        Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", "screenshare::tests::wait_a_while"])
            .spawn()
            .unwrap()
    }

    #[test]
    #[ignore = "only run as a child process by own_processes"]
    fn wait_a_while() {
        std::thread::sleep(Duration::from_secs(5));
    }

    #[test]
    fn own_processes() {
        let own = own();
        assert!(own.contains(std::process::id()));
        assert!(!own.contains(1), "init is not ours");

        let mut same = same_exe_child();
        let mut other = Command::new("sleep").arg("5").spawn().unwrap();
        // Give the children time to exec, so /proc shows their final executable.
        std::thread::sleep(Duration::from_millis(200));
        assert!(own.contains(same.id()), "a same-executable child is ours");
        assert!(
            !own.contains(other.id()),
            "a program we launched is another application"
        );
        same.kill().unwrap();
        other.kill().unwrap();
        let _ = (same.wait(), other.wait());
    }

    #[test]
    fn parent_reads_the_parent_pid() {
        let me = std::process::id();
        assert_eq!(parent(me), Some(std::os::unix::process::parent_id()));
    }
}

//! Pinniped desktop helper. Does the Linux desktop work Electron cannot: the freedesktop portals
//! (global shortcuts, autostart) and the PipeWire device for screen share audio.
//!
//! The Electron main process starts this binary and talks to it over stdio, one JSON object per
//! line. Commands go in on stdin, events come out on stdout. Logs go to stderr.
//!
//! Commands:
//! - `{"cmd":"shortcuts","shortcuts":[{"id":"mute","description":"Toggle microphone","trigger":"CTRL+M"}]}`
//!   binds global shortcuts. The desktop asks the user to confirm or change the keys.
//! - `{"cmd":"autostart","enabled":true,"minimized":false,"command":["/usr/bin/pinniped"]}`
//!   asks the Background portal to start the app at login.
//! - `{"cmd":"screenshare_prepare"}` creates the virtual microphone for screen share audio.
//! - `{"cmd":"screenshare_link","active":true,"output":"Speakers"}` starts (or with `false`
//!   stops) feeding other applications' audio into it; see screenshare.rs.
//! - `{"cmd":"screenshare_release"}` removes it.
//!
//! Events:
//! - `{"event":"ready","shortcuts":true}` once the portals are reachable.
//! - `{"event":"activated","id":"mute"}` when a bound shortcut is pressed.
//! - `{"event":"result","cmd":"shortcuts","ok":true,"error":null}` answers each command.

mod screenshare;

use std::collections::HashMap;
use std::io::Write;

use ashpd::desktop::global_shortcuts::{BindShortcutsOptions, GlobalShortcuts, NewShortcut};
use ashpd::desktop::Session;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use zbus::{OwnedVariant, Variant};

/// Matches the installed desktop file (`club.stablecat.pinniped.desktop`), so the portal can look the app up.
const APP_ID: &str = "club.stablecat.pinniped";
const PORTAL_DEST: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    Shortcuts {
        shortcuts: Vec<ShortcutSpec>,
    },
    Autostart {
        enabled: bool,
        minimized: bool,
        command: Vec<String>,
    },
    ScreensharePrepare,
    ScreenshareLink {
        active: bool,
        #[serde(default)]
        output: String,
    },
    ScreenshareRelease,
}

#[derive(Deserialize)]
struct ShortcutSpec {
    id: String,
    description: String,
    trigger: Option<String>,
}

#[derive(Serialize)]
#[serde(tag = "event", rename_all = "lowercase")]
enum Event<'a> {
    Ready {
        app_id: bool,
        shortcuts: bool,
    },
    Activated {
        id: &'a str,
    },
    Result {
        cmd: &'static str,
        ok: bool,
        error: Option<String>,
    },
}

fn emit(event: &Event) {
    let mut out = std::io::stdout().lock();
    // A closed stdout means Electron is gone; there is nothing useful left to do, so exit.
    if serde_json::to_writer(&mut out, event).is_err()
        || writeln!(out).is_err()
        || out.flush().is_err()
    {
        std::process::exit(0);
    }
}

struct Helper {
    conn: zbus::Connection,
    shortcuts: Option<GlobalShortcuts>,
    session: Option<Session<GlobalShortcuts>>,
    screenshare: screenshare::ScreenShare,
}

impl Helper {
    async fn shortcuts_command(
        &mut self,
        specs: Vec<ShortcutSpec>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let portal = self
            .shortcuts
            .as_ref()
            .ok_or("the GlobalShortcuts portal is not available")?;
        if self.session.is_none() {
            self.session = Some(portal.create_session(Default::default()).await?);
        }
        let session = self.session.as_ref().expect("session was just created");
        let new: Vec<NewShortcut> = specs
            .into_iter()
            .map(|s| NewShortcut::new(s.id, s.description).preferred_trigger(s.trigger.as_deref()))
            .collect();
        // BindShortcuts replaces the whole list, so every call sends all shortcuts.
        portal
            .bind_shortcuts(session, &new, None, BindShortcutsOptions::default())
            .await?
            .response()?;
        Ok(())
    }

    /// Asks the Background portal to autostart the app. The request is subscribed to before it is
    /// sent, so the answer cannot arrive unseen, and the portal's own answer decides the result.
    async fn autostart_command(
        &self,
        enabled: bool,
        minimized: bool,
        command: Vec<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let sender = self
            .conn
            .unique_name()
            .ok_or("no D-Bus unique name")?
            .as_str()
            .trim_start_matches(':')
            .replace('.', "_");
        let token = "pinniped_autostart";
        let request_path = format!("{PORTAL_PATH}/request/{sender}/{token}");

        let request = zbus::Proxy::new(
            &self.conn,
            PORTAL_DEST,
            request_path.as_str(),
            "org.freedesktop.portal.Request",
        )
        .await?;
        let mut responses = request.receive_signal("Response").await?;

        let mut options: HashMap<&str, Variant> = HashMap::new();
        options.insert("handle_token", Variant::from(token));
        options.insert("autostart", Variant::from(enabled));
        options.insert("reason", Variant::from("Open Pinniped when you log in"));
        if enabled {
            let mut argv = command;
            if minimized {
                argv.push("--hidden".to_string());
            }
            options.insert("commandline", Variant::from(argv));
        }

        let background = zbus::Proxy::new(
            &self.conn,
            PORTAL_DEST,
            PORTAL_PATH,
            "org.freedesktop.portal.Background",
        )
        .await?;
        let _handle: zbus::OwnedObjectPath =
            background.call("RequestBackground", &("", options)).await?;

        let message = responses
            .next()
            .await
            .ok_or("the Background portal closed without answering")?;
        let (code, _results): (u32, HashMap<String, OwnedVariant>) =
            message.body().deserialize()?;
        match code {
            0 => Ok(()),
            1 => Err("autostart was cancelled".into()),
            _ => Err("the Background portal refused autostart".into()),
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let conn = zbus::Connection::session().await?;

    // The portals identify an unsandboxed app by an ID it registers on this connection.
    let app_id = ashpd::AppID::try_from(APP_ID)?;
    let registered = match ashpd::register_host_app_with_connection(conn.clone(), app_id).await {
        Ok(()) => true,
        Err(err) => {
            eprintln!("app ID registration failed: {err}");
            false
        }
    };
    let shortcuts = GlobalShortcuts::with_connection(conn.clone()).await.ok();
    emit(&Event::Ready {
        app_id: registered,
        shortcuts: shortcuts.is_some(),
    });

    let mut helper = Helper {
        conn,
        shortcuts,
        session: None,
        screenshare: Default::default(),
    };
    let mut activated = match helper.shortcuts.as_ref() {
        Some(portal) => Some(portal.receive_activated().await?),
        None => None,
    };

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else { break };
                if line.trim().is_empty() { continue; }
                let (cmd, result) = match serde_json::from_str::<Command>(&line) {
                    Ok(Command::Shortcuts { shortcuts }) => ("shortcuts", helper.shortcuts_command(shortcuts).await),
                    Ok(Command::Autostart { enabled, minimized, command }) => {
                        ("autostart", helper.autostart_command(enabled, minimized, command).await)
                    }
                    Ok(Command::ScreensharePrepare) => ("screenshare_prepare", helper.screenshare.prepare().await),
                    Ok(Command::ScreenshareLink { active, output }) => ("screenshare_link", helper.screenshare.link(active, output)),
                    Ok(Command::ScreenshareRelease) => {
                        helper.screenshare.release();
                        ("screenshare_release", Ok(()))
                    }
                    Err(err) => ("invalid", Err(err.into())),
                };
                emit(&Event::Result { cmd, ok: result.is_ok(), error: result.err().map(|e| e.to_string()) });
            }
            Some(signal) = async { match activated.as_mut() { Some(s) => StreamExt::next(s).await, None => std::future::pending().await } } => {
                emit(&Event::Activated { id: signal.shortcut_id() });
            }
            () = helper.screenshare.readable() => helper.screenshare.dispatch(),
        }
    }
    Ok(())
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("pinniped-helper: {err}");
        std::process::exit(1);
    }
}

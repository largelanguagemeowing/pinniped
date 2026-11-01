// System audio for screen shares on Linux, the way Discord does it: a virtual
// PipeWire microphone that carries the audio of every other application but
// not Pinniped's own, so the call and the soundboard never echo back into the
// share. Chromium's getDisplayMedia() cannot capture system audio on Linux, so
// the call widget opens this virtual microphone and publishes it as the
// share's audio track.
//
// Only the CLI tools are used (pactl, pw-dump, pw-link), no native module.
// The renderer calls prepare() once a call is up so the device exists when a
// share starts, link(true) while a share runs and release() when it is over.
const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

// Shown as the device's name; the call widget finds the device by it.
const DEVICE_NAME = 'pinniped-screenshare';
const DEVICE_LABEL = 'Pinniped Screen Share Audio';

let moduleId = null;
let monitor = null;
// Label of the output device Pinniped plays to; '' is the system default.
let outputLabel = '';

const available = () => process.platform === 'linux';

// Our own audio comes from Chromium's audio service, a child process, so every
// process we own is excluded rather than just the main one.
const ownPids = () => new Set(app.getAppMetrics().map((m) => m.pid));

async function prepare() {
  if (!available()) return { ok: false, error: 'unsupported platform' };
  if (moduleId !== null) return { ok: true, label: DEVICE_LABEL };
  try {
    // A crash can leave the device of a previous run behind.
    const { stdout: loaded } = await run('pactl', ['list', 'short', 'modules']);
    await Promise.all(
      loaded
        .split('\n')
        .filter((line) => line.includes(`sink_name=${DEVICE_NAME}`))
        .map((line) => run('pactl', ['unload-module', line.split('\t')[0]]).catch(() => {}))
    );
    const { stdout } = await run('pactl', [
      'load-module',
      'module-null-sink',
      `sink_name=${DEVICE_NAME}`,
      'channels=2',
      'channel_map=front-left,front-right',
      `sink_properties=media.class=Audio/Source/Virtual device.description="${DEVICE_LABEL}"`,
    ]);
    moduleId = stdout.trim();
    return { ok: true, label: DEVICE_LABEL };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

// Links every other application's output ports to the virtual microphone's
// input ports. PipeWire lets an output feed several inputs, so the application
// keeps playing to the speakers as before.
// The playback device Pinniped is set to use: the sink whose description is the
// label Chromium shows for it, else the system default sink.
function outputSink(objects, nodes) {
  const sinks = nodes.filter((n) => n.info?.props?.['media.class'] === 'Audio/Sink');
  const named = outputLabel
    ? sinks.find((n) => {
        const props = n.info.props;
        return props['node.description'] === outputLabel || props['node.nick'] === outputLabel;
      })
    : undefined;
  if (named) return named;
  const entries = objects
    .filter((o) => o.type === 'PipeWire:Interface:Metadata')
    .filter((o) => o.props?.['metadata.name'] === 'default')
    .flatMap((o) => o.metadata ?? []);
  const name = entries.find((e) => e.key === 'default.audio.sink')?.value?.name;
  return sinks.find((n) => n.info.props['node.name'] === name);
}

async function linkOnce(objects) {
  const nodes = objects.filter((o) => o.type === 'PipeWire:Interface:Node');
  const ports = objects.filter((o) => o.type === 'PipeWire:Interface:Port');
  const sink = nodes.find((n) => n.info?.props?.['node.name'] === DEVICE_NAME);
  if (!sink) return;

  const sinkIn = new Map(
    ports
      .filter((p) => p.info.props['node.id'] === sink.id && p.info.direction === 'input')
      .map((p) => [p.info.props['audio.channel'], p.id])
  );
  const linked = new Set(
    objects
      .filter((o) => o.type === 'PipeWire:Interface:Link')
      .map((o) => `${o.info['output-port-id']}:${o.info['input-port-id']}`)
  );
  const own = ownPids();

  // Only what is played to Pinniped's output device is shared. With virtual audio routing an
  // application feeds a virtual device and a loopback forwards it to the real one; capturing both
  // would send the sound twice, so only the streams that reach the output device itself count.
  const output = outputSink(objects, nodes);
  const outputPorts = new Set(
    ports.filter((p) => p.info.props['node.id'] === output?.id).map((p) => p.id)
  );
  const links = objects.filter((o) => o.type === 'PipeWire:Interface:Link');
  const reachesOutput = new Set(
    links
      .filter((l) => outputPorts.has(l.info['input-port-id']))
      .map((l) => l.info['output-node-id'])
  );

  // Streams that stopped qualifying, because they moved to another device, lose their link.
  const sinkPorts = new Set(sinkIn.values());
  await Promise.all(
    links
      .filter((l) => sinkPorts.has(l.info['input-port-id']))
      .filter((l) => !reachesOutput.has(l.info['output-node-id']))
      .map((l) =>
        run('pw-link', [
          '-d',
          String(l.info['output-port-id']),
          String(l.info['input-port-id']),
        ]).catch(() => {})
      )
  );

  const wanted = [];
  for (const node of nodes) {
    const props = node.info?.props ?? {};
    if (props['media.class'] !== 'Stream/Output/Audio') continue;
    if (own.has(Number(props['application.process.id']))) continue;
    if (!reachesOutput.has(node.id)) continue;
    for (const port of ports) {
      if (port.info.props['node.id'] !== node.id || port.info.direction !== 'output') continue;
      const channel = port.info.props['audio.channel'];
      // A mono stream feeds both sides.
      const targets = sinkIn.has(channel) ? [sinkIn.get(channel)] : [...sinkIn.values()];
      for (const target of targets) wanted.push([port.id, target]);
    }
  }
  await Promise.all(
    wanted
      .filter(([out, inn]) => !linked.has(`${out}:${inn}`))
      .map(([out, inn]) => run('pw-link', [String(out), String(inn)]).catch(() => {}))
  );
}

// `pw-dump --monitor` prints the whole graph as one JSON array, then an array of
// the objects that changed (`info: null` once one is gone) whenever something does.
// Each array starts and ends on an unindented bracket line.
function link(active, output = '') {
  const changed = output !== outputLabel;
  outputLabel = output;
  if (!active || (monitor && changed)) {
    monitor?.kill();
    monitor = null;
  }
  if (!active) return;
  if (monitor || moduleId === null) return;

  const child = spawn('pw-dump', ['--monitor', '--no-colors'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  // Without pw-dump (no PipeWire tools) spawn emits 'error'; unhandled, that
  // would crash the main process.
  child.on('error', () => {
    if (monitor === child) monitor = null;
  });
  monitor = child;
  const graph = new Map();
  let batch = [];
  let pending = null;
  let running = false;
  let again = false;

  const apply = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await linkOnce([...graph.values()]);
      } while (again);
    } catch {
      // The sink went away mid-run; the next change retries.
    }
    running = false;
  };

  const merge = (changes) => {
    changes.forEach((o) => {
      if (o.info === null) {
        graph.delete(o.id);
        return;
      }
      const old = graph.get(o.id);
      if (o.metadata) {
        // Metadata changes carry entries, which replace the old ones with the same key.
        const entries = new Map((old?.metadata ?? []).map((e) => [`${e.subject}:${e.key}`, e]));
        o.metadata.forEach((e) => entries.set(`${e.subject}:${e.key}`, e));
        graph.set(o.id, { ...old, ...o, metadata: [...entries.values()] });
        return;
      }
      graph.set(o.id, {
        ...old,
        ...o,
        info: { ...old?.info, ...o.info, props: { ...old?.info?.props, ...o.info?.props } },
      });
    });
    // Applying a change can cause more, and a new stream tends to arrive as several.
    clearTimeout(pending);
    pending = setTimeout(apply, 50);
  };

  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach((line) => {
      batch.push(line);
      if (line !== ']') return;
      try {
        merge(JSON.parse(batch.join('\n')));
      } catch {
        // A malformed batch is dropped; the next one carries on from the graph so far.
      }
      batch = [];
    });
  });
  child.on('exit', () => {
    clearTimeout(pending);
    if (monitor === child) monitor = null;
  });
}

async function release() {
  link(false);
  if (moduleId === null) return;
  const id = moduleId;
  moduleId = null;
  await run('pactl', ['unload-module', id]).catch(() => {});
}

// Unloading is a child process, so it cannot wait for the app to exit; the
// module would linger as a stray device until PipeWire restarts.
function releaseSync() {
  if (moduleId === null) return;
  const { execFileSync } = require('child_process');
  try {
    execFileSync('pactl', ['unload-module', moduleId]);
  } catch {
    // ignore
  }
  moduleId = null;
}

module.exports = { available, prepare, link, release, releaseSync, DEVICE_LABEL };

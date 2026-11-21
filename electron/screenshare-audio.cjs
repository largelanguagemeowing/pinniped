// System audio for screen shares on Linux: a virtual PipeWire microphone that
// carries the audio of every other application but not Pinniped's own, so the
// call and the soundboard never echo back into the share. Chromium's
// getDisplayMedia() cannot capture system audio on Linux, so the call
// opens this virtual microphone and publishes it as the share's audio track.
//
// The helper (electron/helper/src/screenshare.rs) does the PipeWire work. The
// device and its links belong to the helper's PipeWire connection, so they
// disappear when the helper exits, which it does when Pinniped does.
//
// Windows has no virtual microphone without a driver, so the helper (electron/helper/src/windows)
// captures the audio itself: the applications that play on the output device, minus Pinniped's
// own process tree. It arrives here as PCM chunks (`pcm` events: 16-bit stereo 48 kHz), which
// main.cjs forwards to the page and the page to the call.
//
// The renderer calls prepare() once a call is up so the device exists when a
// share starts, link(true) while a share runs and release() when it is over.
const { helper } = require('./helper.cjs');

// Shown as the device's name; the call finds the device by it.
const DEVICE_LABEL = 'Pinniped Screen Share Audio';

const { EventEmitter } = require('events');

const available = () => process.platform === 'linux' || process.platform === 'win32';
const streamsPcm = () => process.platform === 'win32';

const events = new EventEmitter();
if (streamsPcm()) helper.on('audio', (chunk) => events.emit('pcm', chunk));

async function prepare() {
  if (!available()) return { ok: false, error: 'unsupported platform' };
  const { ok, error } = await helper.request({ cmd: 'screenshare_prepare' });
  return ok ? { ok: true, label: streamsPcm() ? 'pcm' : DEVICE_LABEL } : { ok: false, error };
}

// Feeds every other application's audio that plays on the output device
// labelled `output` (the system default when empty) into the device (Linux) or the pcm
// events (Windows) while `active`. Applications keep playing to their speakers as before.
// `exclude` lists programs (executable file names) whose audio is never shared (Windows).
// `only`, an id from apps(), limits the share to that application.
async function link(active, output = '', exclude = [], only = undefined) {
  if (!available()) return;
  await helper.request({
    cmd: 'screenshare_link',
    active,
    output,
    pid: process.pid,
    exclude,
    ...(typeof only === 'string' ? { only } : {}),
  });
}

// The applications that play audio on the output device labelled `output` right now, which a
// share could be limited to: `{ id, name }` each, never Pinniped, and on Windows without the
// `exclude`d programs.
async function apps(output = '', exclude = []) {
  if (!available()) return [];
  const result = await helper.request({
    cmd: 'screenshare_apps',
    output,
    pid: process.pid,
    exclude,
  });
  if (!result.ok || !Array.isArray(result.apps)) return [];
  return result.apps
    .filter((a) => a && typeof a.id === 'string' && a.id !== '' && typeof a.name === 'string')
    .map(({ id, name }) => ({ id, name }));
}

async function release() {
  if (!available()) return;
  await helper.request({ cmd: 'screenshare_release' });
}

// Opens or closes the helper's console window with debug logging (Windows).
function setConsole(enabled) {
  if (process.platform === 'win32') helper.setConsole(enabled === true);
}

module.exports = { available, prepare, link, apps, release, setConsole, events, DEVICE_LABEL };

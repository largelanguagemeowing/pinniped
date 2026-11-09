// System audio for screen shares on Linux: a virtual PipeWire microphone that
// carries the audio of every other application but not Pinniped's own, so the
// call and the soundboard never echo back into the share. Chromium's
// getDisplayMedia() cannot capture system audio on Linux, so the call widget
// opens this virtual microphone and publishes it as the share's audio track.
//
// The helper (electron/helper/src/screenshare.rs) does the PipeWire work. The
// device and its links belong to the helper's PipeWire connection, so they
// disappear when the helper exits, which it does when Pinniped does.
// The renderer calls prepare() once a call is up so the device exists when a
// share starts, link(true) while a share runs and release() when it is over.
const { helper } = require('./helper.cjs');

// Shown as the device's name; the call widget finds the device by it.
const DEVICE_LABEL = 'Pinniped Screen Share Audio';

const available = () => process.platform === 'linux';

async function prepare() {
  if (!available()) return { ok: false, error: 'unsupported platform' };
  const { ok, error } = await helper.request({ cmd: 'screenshare_prepare' });
  return ok ? { ok: true, label: DEVICE_LABEL } : { ok: false, error };
}

// Feeds every other application's audio that plays on the output device
// labelled `output` (the system default when empty) into the device while
// `active`. Applications keep playing to their speakers as before.
async function link(active, output = '') {
  if (!available()) return;
  await helper.request({ cmd: 'screenshare_link', active, output });
}

async function release() {
  if (!available()) return;
  await helper.request({ cmd: 'screenshare_release' });
}

module.exports = { available, prepare, link, release, DEVICE_LABEL };

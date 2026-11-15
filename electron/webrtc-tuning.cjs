// WebRTC congestion-control tuning. Chromium reads `WebRTC-*` field trials from
// --force-fieldtrials at startup, so this has to be decided before the app is ready: the
// choice lives in a small JSON file in userData (the renderer's settings are not readable here)
// and changing it takes a restart. Discord ships the same kind of trials in its own libwebrtc.
const fs = require('fs');
const path = require('path');

// Name/Group/ pairs, as --force-fieldtrials wants them. The group is what libwebrtc parses.
const TRIALS = [
  // Loss-based estimator v2: reacts to loss without the old hard back-off.
  'WebRTC-Bwe-LossBasedBweV2/Enabled:true/',
  // Judge audio packets' delay on their own, so a video burst does not read as congestion.
  'WebRTC-Bwe-SeparateAudioPackets/enabled:true,packet_threshold:10,time_threshold:1s/',
  // Trendline (delay-based) estimator: cap the estimate from the start and end of a window.
  'WebRTC-BWE-TrendlineEstimatorSettings/enable_cap:true/',
];

const FILE_NAME = 'webrtc-tuning.json';

function readEnabled(userDataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(userDataDir, FILE_NAME), 'utf8'));
    return data?.bweTrials === true;
  } catch {
    return false;
  }
}

function writeEnabled(userDataDir, enabled) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, FILE_NAME),
    JSON.stringify({ bweTrials: enabled === true })
  );
}

// Appends the trials to the command line. PINNIPED_WEBRTC_TRIALS (a full trial string) wins over
// the saved choice, for trying values without touching the settings. Returns what was applied.
function applyFieldTrials(app) {
  const override = process.env.PINNIPED_WEBRTC_TRIALS;
  const userData = app.getPath('userData');
  const trials = override ?? (readEnabled(userData) ? TRIALS.join('') : '');
  if (trials) app.commandLine.appendSwitch('force-fieldtrials', trials);
  return trials;
}

module.exports = { TRIALS, applyFieldTrials, readEnabled, writeEnabled };

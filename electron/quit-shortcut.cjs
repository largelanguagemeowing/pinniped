// Whether Ctrl+Q quits the app. Off unless the user turns it on (Settings → General): quitting
// also leaves the call, so a stray keypress should not do it. The choice is a small JSON file
// in userData, because the menu is built in the main process, which cannot read the page's
// settings.
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'quit-shortcut.json';

function readEnabled(userDataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(userDataDir, FILE_NAME), 'utf8'));
    return data?.enabled === true;
  } catch {
    return false;
  }
}

function writeEnabled(userDataDir, enabled) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, FILE_NAME),
    JSON.stringify({ enabled: enabled === true })
  );
}

module.exports = { readEnabled, writeEnabled };

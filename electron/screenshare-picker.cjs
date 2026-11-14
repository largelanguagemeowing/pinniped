const { desktopCapturer } = require('electron');

// Chromium on Windows has no screen picker of its own, and Electron's `useSystemPicker` only
// exists on macOS 15+. So on Windows the app draws one itself, inside the screen share dialog
// (src/app/features/call/ScreenSharePicker.tsx). The dialog asks for the list when it opens
// (building thumbnails takes a moment, so this must not wait for Go Live), and tells us what
// was chosen before it starts the share; the display media handler then just takes that
// source. Linux goes through the xdg-desktop-portal instead.

// A choice is only good for the share that follows it right away.
const CHOICE_TTL_MS = 30 * 1000;

let listed = [];
let chosen = null;
let chosenTimer = null;

const dataUrl = (image, jpeg) =>
  jpeg ? `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}` : image.toDataURL();

/** The screens and windows that can be shared, with thumbnails, for the page to show. */
async function listScreenShareSources() {
  const all = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 640, height: 360 },
    fetchWindowIcons: true,
  });
  // Windows Graphics Capture cannot grab some listed windows (hidden or system helpers); they
  // come back with an empty thumbnail and would show up as blank cards that fail when picked.
  listed = all.filter((s) => s.id.startsWith('screen:') || !s.thumbnail.isEmpty());
  return listed.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: dataUrl(s.thumbnail, true),
    icon: s.appIcon && !s.appIcon.isEmpty() ? dataUrl(s.appIcon, false) : null,
  }));
}

/** What the page chose from the list (a source id), or null to forget it. */
function selectScreenShareSource(id) {
  clearTimeout(chosenTimer);
  chosen = typeof id === 'string' ? (listed.find((s) => s.id === id) ?? null) : null;
  if (chosen) {
    chosenTimer = setTimeout(() => {
      chosen = null;
    }, CHOICE_TTL_MS);
  }
}

/**
 * The source for the share that is starting: the one the page chose, once. Without a choice
 * (a share that did not come from the dialog) the first screen, which needs no thumbnails.
 */
async function takeScreenShareSource() {
  if (chosen) {
    const source = chosen;
    selectScreenShareSource(null);
    return source;
  }
  const screens = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return screens[0];
}

module.exports = { listScreenShareSources, selectScreenShareSource, takeScreenShareSource };

// Runs with context isolation; keep the surface minimal.
const { contextBridge, ipcRenderer } = require('electron');

// Before the window closes or reloads, the main process asks the page to leave its call
// (`call:leave`) and waits for `call:left` with the same id. The page registers what leaving
// means while it is in a call; without one the answer is immediate.
let leaveCallHandler = null;
ipcRenderer.on('call:leave', async (_event, requestId) => {
  const handler = leaveCallHandler;
  let inCall = false;
  if (handler) {
    try {
      await handler();
      inCall = true;
    } catch {
      // leaving failed; close anyway
    }
  }
  ipcRenderer.send('call:left', requestId, inCall);
});

contextBridge.exposeInMainWorld('pinnipedDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  showWindow: () => ipcRenderer.send('window:show'),
  setBadgeCount: (count, overlay, hasUnread) =>
    ipcRenderer.send('badge:set', { count, overlay, hasUnread }),
  setMediaAuth: (baseUrl, accessToken) => ipcRenderer.send('media-auth:set', baseUrl, accessToken),
  getAutostart: () => ipcRenderer.invoke('startup:get'),
  setAutostart: (enabled, minimized) => ipcRenderer.invoke('startup:set', enabled, minimized),
  getSystemIdleTime: () => ipcRenderer.invoke('system:idle-time'),
  bindHotkeys: (shortcuts) => ipcRenderer.invoke('hotkeys:bind', shortcuts),
  onHotkey: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('hotkey:activated', listener);
    return () => ipcRenderer.removeListener('hotkey:activated', listener);
  },
  // Linux: a virtual microphone with the other applications' audio, for screen shares.
  // Windows: the same audio, streamed as PCM chunks (`onPcm`).
  screenShareAudio:
    process.platform === 'linux' || process.platform === 'win32'
      ? {
          prepare: () => ipcRenderer.invoke('screenshare-audio:prepare'),
          link: (active, output, exclude, only) =>
            ipcRenderer.invoke('screenshare-audio:link', active, output, exclude, only),
          apps: (output, exclude) => ipcRenderer.invoke('screenshare-audio:apps', output, exclude),
          release: () => ipcRenderer.invoke('screenshare-audio:release'),
          setConsole: (enabled) => ipcRenderer.send('screenshare-audio:console', enabled),
          onPcm:
            process.platform === 'win32'
              ? (cb) => {
                  const listener = (_event, chunk) => cb(chunk);
                  ipcRenderer.on('screenshare-audio:pcm', listener);
                  return () => ipcRenderer.removeListener('screenshare-audio:pcm', listener);
                }
              : undefined,
        }
      : undefined,
  // Windows: what the screen share dialog picks from. `list` is slow (thumbnails), so the
  // dialog asks when it opens; `select` tells the main process what the next share captures.
  screenSharePicker:
    process.platform === 'win32'
      ? {
          list: () => ipcRenderer.invoke('screenshare-picker:list'),
          select: (id) => ipcRenderer.send('screenshare-picker:select', id),
        }
      : undefined,
  // Whether the WebRTC bandwidth-estimation field trials are on; applies after `restart`.
  webrtcTuning: {
    get: () => ipcRenderer.invoke('webrtc-tuning:get'),
    set: (enabled) => ipcRenderer.invoke('webrtc-tuning:set', enabled),
    restart: () => ipcRenderer.invoke('webrtc-tuning:restart'),
  },
  onLeaveCallRequest: (handler) => {
    leaveCallHandler = handler;
    return () => {
      if (leaveCallHandler === handler) leaveCallHandler = null;
    };
  },
  // The installed Windows build updates itself; `getStatus` says `unsupported` everywhere else.
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb) => {
      const listener = (_event, status) => cb(status);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    },
  },
  // MSC4320 rich-presence publisher: the main process impersonates Discord's
  // local RPC pipe and forwards activity here for the renderer to publish.
  supportsRichPresenceBridge: true,
  startRichPresenceBridge: () => ipcRenderer.invoke('rich-presence:start'),
  stopRichPresenceBridge: () => ipcRenderer.invoke('rich-presence:stop'),
  onRichPresenceActivity: (cb) => {
    const listener = (_event, activity) => cb(activity);
    ipcRenderer.on('rich-presence:activity', listener);
    return () => ipcRenderer.removeListener('rich-presence:activity', listener);
  },
});

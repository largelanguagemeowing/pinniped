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
      // the widget is gone already; close anyway
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
  screenShareAudio:
    process.platform === 'linux'
      ? {
          prepare: () => ipcRenderer.invoke('screenshare-audio:prepare'),
          link: (active, output) => ipcRenderer.invoke('screenshare-audio:link', active, output),
          release: () => ipcRenderer.invoke('screenshare-audio:release'),
        }
      : undefined,
  onLeaveCallRequest: (handler) => {
    leaveCallHandler = handler;
    return () => {
      if (leaveCallHandler === handler) leaveCallHandler = null;
    };
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

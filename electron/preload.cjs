// Runs with context isolation; keep the surface minimal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cinnyDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // MSC4320 rich-presence publisher: the main process impersonates Discord's
  // local RPC pipe and forwards activity here for the renderer to publish.
  showWindow: () => ipcRenderer.send('window:show'),
  setBadgeCount: (count, overlay, hasUnread) =>
    ipcRenderer.send('badge:set', { count, overlay, hasUnread }),
  setMediaAuth: (baseUrl, accessToken) => ipcRenderer.send('media-auth:set', baseUrl, accessToken),
  getAutostart: () => ipcRenderer.invoke('startup:get'),
  setAutostart: (enabled, minimized) => ipcRenderer.invoke('startup:set', enabled, minimized),
  getSystemIdleTime: () => ipcRenderer.invoke('system:idle-time'),
  // Linux: a virtual microphone with the other applications' audio, for screen shares.
  screenShareAudio:
    process.platform === 'linux'
      ? {
          prepare: () => ipcRenderer.invoke('screenshare-audio:prepare'),
          link: (active, output) => ipcRenderer.invoke('screenshare-audio:link', active, output),
          release: () => ipcRenderer.invoke('screenshare-audio:release'),
        }
      : undefined,
  supportsRichPresenceBridge: true,
  startRichPresenceBridge: () => ipcRenderer.invoke('rich-presence:start'),
  stopRichPresenceBridge: () => ipcRenderer.invoke('rich-presence:stop'),
  onRichPresenceActivity: (cb) => {
    const listener = (_event, activity) => cb(activity);
    ipcRenderer.on('rich-presence:activity', listener);
    return () => ipcRenderer.removeListener('rich-presence:activity', listener);
  },
});

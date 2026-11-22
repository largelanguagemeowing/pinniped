// Standard application menu. Kept hidden via the window's autoHideMenuBar, but
// its accelerators still fire (Ctrl+Shift+I / F12 devtools, reload, zoom, etc.).

const { Menu } = require('electron');

const isMac = process.platform === 'darwin';

function buildAppMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    // No Close item anywhere (the stock File and Window menus have one on Ctrl/Cmd+W): a stray
    // keypress would close the window and, with it, leave the call. The window has its own
    // close button.
    ...(isMac ? [] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }, // Ctrl+Shift+I (Cmd+Opt+I on mac)
        {
          label: 'Toggle Developer Tools (F12)',
          accelerator: 'F12',
          click: (_item, win) => win && win.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu };

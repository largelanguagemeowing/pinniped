// Call hotkeys for the desktop app. On Linux they go through the portal helper (see helper.cjs),
// which works on Wayland. Elsewhere Electron's globalShortcut registers them, which covers
// Windows, macOS and X11. Both report presses as the same `activated` event with the shortcut id.
const { EventEmitter } = require('events');
const { globalShortcut } = require('electron');
const { helper } = require('./helper.cjs');
const { toAccelerator } = require('./accelerator.cjs');

class Hotkeys extends EventEmitter {
  constructor() {
    super();
    this.registered = [];
  }

  /**
   * Replaces every binding with `shortcuts` ([{ id, description, trigger }]). An empty list
   * clears them. Resolves to `{ ok, error }`.
   */
  async bind(shortcuts) {
    if (process.platform === 'linux') {
      this.unregisterAll();
      const result = await helper.request({ cmd: 'shortcuts', shortcuts });
      return { ok: result.ok, error: result.error ?? null };
    }
    return this.bindElectron(shortcuts);
  }

  bindElectron(shortcuts) {
    this.unregisterAll();
    const failures = [];
    shortcuts.forEach(({ id, trigger }) => {
      const accelerator = toAccelerator(trigger);
      if (!accelerator) {
        failures.push(`${id}: unsupported key`);
        return;
      }
      const ok = globalShortcut.register(accelerator, () => this.emit('activated', id));
      if (ok) this.registered.push(accelerator);
      else failures.push(`${id}: ${accelerator} is already used by another application`);
    });
    return failures.length ? { ok: false, error: failures.join('; ') } : { ok: true, error: null };
  }

  unregisterAll() {
    this.registered.splice(0).forEach((accelerator) => globalShortcut.unregister(accelerator));
  }
}

const hotkeys = new Hotkeys();
// The helper reports portal presses on its own channel; re-emit them on the same bus.
helper.on('activated', (id) => hotkeys.emit('activated', id));

module.exports = { hotkeys };

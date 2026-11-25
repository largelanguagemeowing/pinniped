// Client for electron/helper (pinniped-helper), the Rust process that does the desktop work
// Electron cannot: on Linux the global shortcuts and autostart portals and the PipeWire device
// for screen share audio, on Windows the per-application capture of screen share audio. The
// helper speaks one JSON object per line on stdio.
// Commands go in on stdin, and each command gets one `result` event back, in order. Activated
// shortcuts arrive as `activated` events at any time.
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

const BINARY = process.platform === 'win32' ? 'pinniped-helper.exe' : 'pinniped-helper';

// Packaged builds ship the binary next to the app; a dev checkout uses the cargo build output.
const helperPath = () => {
  const packaged = path.join(process.resourcesPath || '', BINARY);
  if (app.isPackaged) return packaged;
  // Relative to this file, not to app.getAppPath(): started as `electron electron/main.cjs` the
  // app path is the electron/ folder, not the repository root.
  return path.join(__dirname, 'helper', 'target', 'release', BINARY);
};

class Helper extends EventEmitter {
  constructor() {
    super();
    // Settings > Developer Tools > Helper Console: the helper gets a console window of its own
    // and logs what it does (PINNIPED_HELPER_CONSOLE=1 turns it on from the environment).
    this.console = process.env.PINNIPED_HELPER_CONSOLE === '1';
    this.child = null;
    this.ready = null;
    this.pending = [];
    this.buffer = '';
  }

  /** Starts the helper once. Resolves to what the portals offer, or undefined if it cannot run. */
  start() {
    if (this.ready) return this.ready;
    if (process.platform !== 'linux' && process.platform !== 'win32')
      return Promise.resolve(undefined);
    const exe = helperPath();
    if (!fs.existsSync(exe)) return Promise.resolve(undefined);

    this.ready = new Promise((resolve) => {
      // The helper is a console program, which Windows opens in a terminal window of its own
      // unless told not to; only the Helper Console option wants that window.
      const child = spawn(exe, [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        windowsHide: !this.console,
        env: this.console ? { ...process.env, PINNIPED_HELPER_DEBUG: '1' } : process.env,
      });
      this.child = child;
      // A write to a helper that stopped listening reports through its own callback; without a
      // listener here the error event would take the main process down.
      child.stdin.on('error', () => undefined);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.onData(chunk, resolve));
      child.on('error', () => resolve(undefined));
      child.on('exit', () => {
        // A helper replaced by setConsole() must not clear the one that replaced it.
        if (this.child === child) {
          this.child = null;
          this.ready = null;
          this.pending.splice(0).forEach((p) => p.resolve({ ok: false, error: 'helper exited' }));
        }
        resolve(undefined);
      });
    });
    return this.ready;
  }

  onData(chunk, resolveReady) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.event === 'ready')
        resolveReady({ appId: event.app_id, shortcuts: event.shortcuts });
      else if (event.event === 'result') this.pending.shift()?.resolve(event);
      else if (event.event === 'activated') this.emit('activated', event.id);
      // Windows: a chunk of screen share audio, base64 of 16-bit stereo 48 kHz PCM.
      else if (event.event === 'audio') this.emit('audio', Buffer.from(event.data, 'base64'));
    }
  }

  /**
   * Turns the console window with debug logging on or off. A running helper is stopped, and the
   * next request starts it again the new way.
   */
  setConsole(enabled) {
    if (this.console === enabled) return;
    this.console = enabled;
    const { child } = this;
    if (!child) return;
    // Forget it at once, so the next request starts a new one instead of writing to this one.
    this.child = null;
    this.ready = null;
    this.pending.splice(0).forEach((p) => p.resolve({ ok: false, error: 'helper restarted' }));
    child.stdin.end();
  }

  /** Sends one command and resolves with its result: `{ ok, error }`. */
  async request(command) {
    const started = await this.start();
    if (!started || !this.child) return { ok: false, error: 'the desktop helper is not available' };
    return new Promise((resolve) => {
      const entry = { resolve };
      this.pending.push(entry);
      this.child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
        if (!error) return;
        // No result will come, and the next one must not be taken for this command's.
        this.pending = this.pending.filter((p) => p !== entry);
        resolve({ ok: false, error: 'the desktop helper is not reachable' });
      });
    });
  }

  stop() {
    this.child?.stdin.end();
  }
}

module.exports = { helper: new Helper() };

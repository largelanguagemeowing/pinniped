// Client for electron/helper (pinniped-helper), the Rust process that does the Linux desktop
// work Electron cannot: the global shortcuts and autostart portals, and the PipeWire device for
// screen share audio. The helper speaks one JSON object per line on stdio.
// Commands go in on stdin, and each command gets one `result` event back, in order. Activated
// shortcuts arrive as `activated` events at any time.
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

const BINARY = 'pinniped-helper';

// Packaged builds ship the binary next to the app; a dev checkout uses the cargo build output.
const helperPath = () => {
  const packaged = path.join(process.resourcesPath || '', BINARY);
  if (app.isPackaged) return packaged;
  return path.join(app.getAppPath(), 'electron', 'helper', 'target', 'release', BINARY);
};

class Helper extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.ready = null;
    this.pending = [];
    this.buffer = '';
  }

  /** Starts the helper once. Resolves to what the portals offer, or undefined if it cannot run. */
  start() {
    if (this.ready) return this.ready;
    if (process.platform !== 'linux') return Promise.resolve(undefined);
    const exe = helperPath();
    if (!fs.existsSync(exe)) return Promise.resolve(undefined);

    this.ready = new Promise((resolve) => {
      const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] });
      this.child = child;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.onData(chunk, resolve));
      child.on('error', () => resolve(undefined));
      child.on('exit', () => {
        this.child = null;
        this.ready = null;
        this.pending.splice(0).forEach((p) => p.resolve({ ok: false, error: 'helper exited' }));
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
    }
  }

  /** Sends one command and resolves with its result: `{ ok, error }`. */
  async request(command) {
    const started = await this.start();
    if (!started || !this.child) return { ok: false, error: 'the desktop helper is not available' };
    return new Promise((resolve) => {
      this.pending.push({ resolve });
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
    });
  }

  stop() {
    this.child?.stdin.end();
  }
}

module.exports = { helper: new Helper() };

// Fork-only. Impersonates Discord's local RPC server so any Discord-RPC-aware
// client (media players, MPRIS bridges, games, editors, ...) publishes its
// activity into Matrix as MSC4320 rich presence.
//
// The wire protocol mirrors arRPC's proven implementation
// (https://github.com/OpenAsar/arRPC): framed `[int32 LE op][int32 LE len][json]`,
// with HANDSHAKE -> READY, SET_ACTIVITY -> activity, PING -> PONG.
//
// We bind the first free discord-ipc-{n} socket, probing by *connecting* (not
// listening) so we never clobber a live server. Slot 0 is preferred; if it is
// taken we start at 2, because Discord itself binds 0 and 1, so slot 1 is never
// tried. Mutually exclusive with Discord in practice, non-destructive always.
const { join } = require('path');
const { platform, env } = require('process');
const { unlinkSync } = require('fs');
const { createServer, createConnection } = require('net');

const log = (...args) => console.log('[pinniped:rpc]', ...args);

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const OP_NAME = ['HANDSHAKE', 'FRAME', 'CLOSE', 'PING', 'PONG'];

const CLOSE_NORMAL = 1000;
const CLOSE_UNSUPPORTED = 1003;
const ERR_INVALID_CLIENTID = 4000;
const ERR_INVALID_VERSION = 4004;
const MAX_FRAME = 1024 * 1024;

const SOCKET_BASE =
  platform === 'win32'
    ? '\\\\?\\pipe\\discord-ipc'
    : join(env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp', 'discord-ipc');

// Inert mock identity returned in the READY dispatch; clients only need a
// plausible user object to proceed. Nothing is ever forwarded to Discord.
const READY = {
  cmd: 'DISPATCH',
  data: {
    v: 1,
    config: {
      cdn_host: 'cdn.discordapp.com',
      api_endpoint: '//discord.com/api',
      environment: 'production',
    },
    user: {
      id: '1045800378228281345',
      username: 'pinniped',
      discriminator: '0',
      global_name: 'Pinniped',
      avatar: null,
      avatar_decoration_data: null,
      bot: false,
      flags: 0,
      premium_type: 0,
    },
  },
  evt: 'READY',
  nonce: null,
};

const encode = (type, data) => {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(type, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

const summarizeActivity = (activity) => {
  if (!activity) return 'clear';
  const parts = [
    activity.name && `name=${JSON.stringify(activity.name)}`,
    activity.details && `details=${JSON.stringify(activity.details)}`,
    activity.state && `state=${JSON.stringify(activity.state)}`,
    activity.type !== undefined && `type=${activity.type}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '(empty)';
};

// Frame parser tolerant of partial reads; drains everything currently buffered.
const wire = (socket, { onHandshake, onRequest }) => {
  const id = () => socket.socketId ?? '?';
  let buf = Buffer.alloc(0);

  const parse = () => {
    while (buf.length >= 8) {
      const type = buf.readInt32LE(0);
      const length = buf.readInt32LE(4);
      if (type < 0 || type > 4 || length < 0 || length > MAX_FRAME) {
        throw new Error(`invalid frame (op=${type}, len=${length})`);
      }
      if (buf.length < 8 + length) return; // wait for the rest
      const payload = JSON.parse(buf.subarray(8, 8 + length).toString('utf8'));
      buf = buf.subarray(8 + length);

      switch (type) {
        case OP.PING:
          log(`ping #${id()}`);
          socket.write(encode(OP.PONG, payload));
          break;
        case OP.PONG:
          log(`pong #${id()}`);
          break;
        case OP.HANDSHAKE:
          onHandshake(payload);
          break;
        case OP.FRAME:
          onRequest(payload);
          break;
        case OP.CLOSE:
          log(`close frame #${id()}`, payload);
          socket.end();
          socket.destroy();
          return;
        default:
          log(`unknown op ${OP_NAME[type] ?? type} #${id()}`);
          break;
      }
    }
  };

  socket.on('readable', () => {
    let chunk;
    while ((chunk = socket.read()) !== null) {
      buf = Buffer.concat([buf, chunk]);
    }
    try {
      parse();
    } catch (err) {
      log(`frame error #${id()}: ${err.message}`);
      try {
        socket.end(encode(OP.CLOSE, { code: CLOSE_UNSUPPORTED, message: String(err.message) }));
      } catch {
        // ignore
      }
      socket.destroy();
    }
  });
};

// Detect whether a live server already owns a socket path by connecting to it.
// ECONNREFUSED => free to bind; any response => in use; timeout => in use.
const probeAvailable = (path) =>
  new Promise((resolve) => {
    const socket = createConnection(path);
    let settled = false;
    const settle = (available) => {
      if (settled) return;
      settled = true;
      try {
        socket.end();
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(available);
    };
    socket.pause();
    socket.write(encode(OP.PING, 1));
    socket.once('readable', () => settle(false));
    socket.once('error', () => settle(true));
    setTimeout(() => settle(false), 750);
  });

// Slot 0, then 2..9. Slot 1 is skipped because Discord binds 0 and 1.
const SLOT_ORDER = [0, 2, 3, 4, 5, 6, 7, 8, 9];

const findFreePath = async () => {
  for (let i = 0; i < SLOT_ORDER.length; i += 1) {
    const n = SLOT_ORDER[i];
    const path = `${SOCKET_BASE}-${n}`;
    const available = await probeAvailable(path);
    log(`probe discord-ipc-${n} ${available ? 'free' : 'in use'}`);
    if (available) {
      if (platform !== 'win32') {
        try {
          unlinkSync(path);
        } catch {
          // remove a stale socket file if present
        }
      }
      return { path, index: n };
    }
  }
  return null;
};

const createRichPresenceServer = ({ onActivity }) => {
  let server = null;
  let bound = null; // { path, index }
  // Per-connection last activity, in most-recently-updated order; current =
  // the newest non-null entry (last-write-wins, matching Discord's behaviour).
  let order = [];
  const activities = new Map();

  const emitCurrent = () => {
    let current = null;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const a = activities.get(order[i]);
      if (a) {
        current = a;
        break;
      }
    }
    log(`emit ${current ? JSON.stringify(current) : 'null'}`);
    try {
      onActivity(current);
    } catch {
      // never let a slow consumer kill the server
    }
  };

  // server.close() waits for open connections, so stop() has to end them.
  const sockets = new Set();

  const handleConnection = (socket) => {
    const socketId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    socket.socketId = socketId;
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    order.push(socketId);
    activities.set(socketId, null);
    log(`connect #${socketId}`);

    const send = (msg) => {
      if (!socket.destroyed) socket.write(encode(OP.FRAME, msg));
    };
    const close = (code = CLOSE_NORMAL, message = '') => {
      try {
        socket.end(encode(OP.CLOSE, { code, message }));
      } catch {
        // ignore
      }
      socket.destroy();
    };

    wire(socket, {
      onHandshake: (params) => {
        const ver = parseInt(params?.v ?? 1, 10);
        const clientId = params?.client_id ?? '';
        log(`handshake #${socketId} v=${ver} client_id=${clientId}`);
        if (ver !== 1) {
          log(`handshake #${socketId} rejected: unsupported version ${ver}`);
          close(ERR_INVALID_VERSION, 'unsupported version');
          return;
        }
        if (!clientId) {
          log(`handshake #${socketId} rejected: missing client_id`);
          close(ERR_INVALID_CLIENTID, 'client id required');
          return;
        }
        socket.clientId = clientId;
        send(READY);
        log(`ready #${socketId}`);
      },
      onRequest: (msg) => {
        const { cmd, args, nonce } = msg ?? {};
        if (cmd === 'SET_ACTIVITY') {
          const activity = args?.activity ?? null;
          log(`set_activity #${socketId} ${summarizeActivity(activity)}`);
          activities.set(socketId, activity);
          order = order.filter((sid) => sid !== socketId).concat(socketId);
          emitCurrent();
          send({
            cmd,
            data: activity
              ? { ...activity, name: '', application_id: socket.clientId, type: activity.type ?? 0 }
              : null,
            evt: null,
            nonce,
          });
          return;
        }
        log(`cmd #${socketId} ${cmd ?? '(none)'}`);
        // SUBSCRIBE / UNSUBSCRIBE / AUTHENTICATE / etc.: acknowledge and ignore
        // so the client does not hang waiting on a response it does not need.
        send({ cmd, data: null, evt: null, nonce });
      },
    });

    socket.on('error', (err) => {
      log(`socket error #${socketId}: ${err.message}`);
    });
    socket.on('close', () => {
      log(`disconnect #${socketId}`);
      order = order.filter((sid) => sid !== socketId);
      activities.delete(socketId);
      emitCurrent();
    });
  };

  const start = async () => {
    if (server) {
      log(`start: already listening on ${bound?.path} (slot ${bound?.index})`);
      return { ok: true, path: bound?.path, index: bound?.index };
    }
    const found = await findFreePath();
    if (!found) {
      log('start: no free discord-ipc slot (0, 2-9 all in use)');
      return { ok: false, error: 'All discord-ipc sockets (0, 2-9) are in use' };
    }
    server = createServer(handleConnection);
    server.on('error', (err) => {
      log(`server error: ${err.message}`);
    });
    try {
      await new Promise((resolve, reject) => {
        server.listen(found.path, resolve);
        server.once('error', reject);
      });
    } catch (err) {
      log(`bind failed: ${err.message}`);
      server = null;
      return { ok: false, error: String(err?.message ?? err) };
    }
    bound = found;
    log(`listening on ${found.path} (slot ${found.index})`);
    return { ok: true, path: found.path, index: found.index };
  };

  const stop = () =>
    new Promise((resolve) => {
      log('stop');
      if (!server) {
        resolve();
        return;
      }
      order = [];
      activities.clear();
      try {
        onActivity(null);
      } catch {
        // ignore
      }
      const closing = server;
      const closedBound = bound;
      // Free the slot at once so a start() right after stop() really listens.
      server = null;
      bound = null;
      for (const socket of sockets) socket.destroy();
      closing.close(() => {
        if (platform !== 'win32' && closedBound) {
          try {
            unlinkSync(closedBound.path);
          } catch {
            // ignore
          }
        }
        resolve();
      });
    });

  return { start, stop };
};

module.exports = { createRichPresenceServer };

// What the About page shows about updates, derived from electron-updater's events. Pure: the
// caller wires the events in and gets every change through `onChange`.
//
// States: unsupported (this build never updates itself), idle (nothing checked yet), checking,
// downloading, current (the last check found nothing newer), ready (installs on quit), error.

const UNSUPPORTED = { state: 'unsupported' };

const MAX_MESSAGE = 200;
// electron-updater errors can carry whole response dumps; the first line is the reason.
const errorMessage = (err) => {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n')[0].slice(0, MAX_MESSAGE) || 'unknown error';
};

/** @param {(status: object) => void} onChange */
function createUpdateStatus(onChange) {
  let status = { state: 'idle' };
  const set = (next) => {
    status = next;
    onChange(status);
  };

  return {
    get: () => status,
    /** A check or a download is under way, so another check would only repeat it. */
    busy: () => status.state === 'checking' || status.state === 'downloading',
    handle(event, payload) {
      // Once an update is downloaded, later checks only find the same one again.
      if (status.state === 'ready') return;
      switch (event) {
        case 'checking-for-update':
          set({ state: 'checking' });
          break;
        case 'update-available':
          set({ state: 'downloading', version: String(payload?.version ?? ''), percent: 0 });
          break;
        case 'download-progress':
          if (status.state === 'downloading') {
            set({ ...status, percent: Math.round(Number(payload?.percent) || 0) });
          }
          break;
        case 'update-not-available':
          set({ state: 'current' });
          break;
        case 'update-downloaded':
          set({ state: 'ready', version: String(payload?.version ?? '') });
          break;
        case 'error':
          set({ state: 'error', message: errorMessage(payload) });
          break;
        default:
          break;
      }
    },
  };
}

module.exports = { createUpdateStatus, UNSUPPORTED };

// Remembers resources (an image URL, a link preview) that failed, and for how long to leave them
// alone. A failure is not cached by the browser, so without this every remount asks again. The
// wait doubles per consecutive failure; a success clears it.

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;
const MAX_ENTRIES = 500;

type Entry = { failures: number; retryAt: number };

const entries = new Map<string, Entry>();

export const recordFailure = (key: string, now = Date.now()): void => {
  const failures = (entries.get(key)?.failures ?? 0) + 1;
  const wait = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  // delete first so the entry moves to the end; the oldest one is evicted
  entries.delete(key);
  entries.set(key, { failures, retryAt: now + wait });
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
};

export const isBackedOff = (key: string, now = Date.now()): boolean =>
  (entries.get(key)?.retryAt ?? 0) > now;

export const clearFailure = (key: string): void => {
  entries.delete(key);
};

export const resetBackoff = (): void => entries.clear();

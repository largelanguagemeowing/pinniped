/**
 * Who in a call is speaking, has their microphone off, is deafened or is sharing their screen
 * (Matrix user IDs). Deafened is reported by each client, so it is not enforced.
 */
export type CallActivity = {
  speakers: ReadonlySet<string>;
  muted: ReadonlySet<string>;
  deafened: ReadonlySet<string>;
  screenSharers: ReadonlySet<string>;
};

export const emptyCallActivity: CallActivity = {
  speakers: new Set(),
  muted: new Set(),
  deafened: new Set(),
  screenSharers: new Set(),
};

const idSet = (value: unknown): Set<string> =>
  new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** Reads the call widget's `club.stablecat.pinniped.call_activity` payload; anything malformed counts as empty. */
export const parseCallActivity = (data: unknown): CallActivity => {
  const { speaking, muted, deafened, screenSharing } = (data ?? {}) as Record<string, unknown>;
  return {
    speakers: idSet(speaking),
    muted: idSet(muted),
    deafened: idSet(deafened),
    screenSharers: idSet(screenSharing),
  };
};

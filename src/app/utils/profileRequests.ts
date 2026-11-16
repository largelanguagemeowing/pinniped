import { MatrixClient } from 'matrix-js-sdk';

// Every message, member row and presence card asks for its user's profile. One request per user is
// shared, and a failed one is remembered, so an unreachable or forbidding homeserver costs one
// request instead of one per row and per remount.

export const PROFILE_FAILURE_TTL_MS = 5 * 60 * 1000;

export type Profile = Record<string, unknown>;
export type ProfileLoader = (userId: string) => Promise<Profile>;

export class RecentProfileFailure extends Error {
  constructor(userId: string) {
    super(`Profile of ${userId} failed recently`);
    this.name = 'RecentProfileFailure';
  }
}

type ClientState = {
  failures: Map<string, number>;
  requests: Map<string, Promise<Profile>>;
};

// Per client, so a new session never reuses another account's results.
const states = new WeakMap<MatrixClient, ClientState>();

const stateOf = (mx: MatrixClient): ClientState => {
  let state = states.get(mx);
  if (!state) {
    state = { failures: new Map(), requests: new Map() };
    states.set(mx, state);
  }
  return state;
};

export const hasRecentProfileFailure = (mx: MatrixClient, userId: string): boolean => {
  const { failures } = stateOf(mx);
  const failedAt = failures.get(userId);
  if (failedAt === undefined) return false;
  if (Date.now() - failedAt < PROFILE_FAILURE_TTL_MS) return true;
  failures.delete(userId);
  return false;
};

/**
 * Loads a user's profile. Rejects with `RecentProfileFailure` without a request while an earlier
 * attempt is still remembered as failed; callers share one in-flight request per user.
 */
export const requestProfile = (
  mx: MatrixClient,
  userId: string,
  load: ProfileLoader = (id) => mx.getExtendedProfile(id)
): Promise<Profile> => {
  if (hasRecentProfileFailure(mx, userId)) return Promise.reject(new RecentProfileFailure(userId));

  const state = stateOf(mx);
  const pending = state.requests.get(userId);
  if (pending) return pending;

  const request = load(userId)
    .then(
      (profile) => {
        state.failures.delete(userId);
        return profile;
      },
      (err) => {
        state.failures.set(userId, Date.now());
        throw err;
      }
    )
    .finally(() => state.requests.delete(userId));
  state.requests.set(userId, request);
  return request;
};

import { MatrixError } from 'matrix-js-sdk';

// What the server told us when it ended the session. A soft logout keeps the
// device (and so its encryption keys) valid for a new login; a hard one does not.
export type SessionEnd = { soft: boolean; reason: string };

const LOGOUT_REASON_KEY = 'club.stablecat.pinniped.logout-reason';

export const readSessionEnd = (error: unknown): SessionEnd => {
  const data: { soft_logout?: unknown; error?: unknown } =
    error instanceof MatrixError && typeof error.data === 'object' && error.data !== null
      ? error.data
      : {};
  const reason =
    typeof data.error === 'string' && data.error !== ''
      ? data.error
      : 'The server ended this session.';
  return { soft: data.soft_logout === true, reason };
};

// Survives the reload that follows a hard logout; localStorage does not.
export const rememberLogoutReason = (reason: string): void => {
  try {
    window.sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch {
    // storage unavailable; the login page just shows no notice
  }
};

export const takeLogoutReason = (): string | undefined => {
  try {
    const reason = window.sessionStorage.getItem(LOGOUT_REASON_KEY) ?? undefined;
    window.sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return undefined;
  }
};

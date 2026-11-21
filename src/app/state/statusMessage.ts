import { MatrixClient, MatrixError, SetPresence } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { useAccountData } from '../hooks/useAccountData';
import { useUserPresence } from '../hooks/useUserPresence';
import type { PresenceChoice } from './settings';

type StatusMessageContent = { status?: string };

// Servers drop status_msg when presence goes offline or is replaced without one,
// so the user's message is kept in account data and re-sent with every change.
export const getRememberedStatus = (mx: MatrixClient): string =>
  mx.getAccountData(AccountDataEvent.PinnipedStatusMessage)?.getContent<StatusMessageContent>()
    ?.status ?? '';

const SYNC_PRESENCE: Record<PresenceChoice, SetPresence> = {
  online: SetPresence.Online,
  unavailable: SetPresence.Unavailable,
  offline: SetPresence.Offline,
};

// A /sync without set_presence counts as online (Synapse), which would undo the presence at the
// next request, so every sync carries it.
export const setSyncPresence = (mx: MatrixClient, presence: PresenceChoice) =>
  mx.setSyncPresence(SYNC_PRESENCE[presence]);

// Synapse allows one presence update every 10 s by default; the server says how long to wait.
const MAX_RATE_LIMIT_RETRIES = 3;

// The newest update per client: one still waiting out a rate limit gives way to it.
const latestUpdates = new WeakMap<MatrixClient, object>();

const putPresence = async (mx: MatrixClient, presence: PresenceChoice, statusMsg: string) => {
  const update = {};
  latestUpdates.set(mx, update);
  for (let retry = 0; ; retry += 1) {
    try {
      await mx.setPresence({ presence, status_msg: statusMsg });
      return;
    } catch (err) {
      const wait =
        err instanceof MatrixError && err.isRateLimitError() ? err.getRetryAfterMs() : null;
      if (wait === null || retry >= MAX_RATE_LIMIT_RETRIES) throw err;
      await new Promise((resolve) => {
        setTimeout(resolve, wait);
      });
      if (latestUpdates.get(mx) !== update) return;
    }
  }
};

// The sync's presence is set first, so no sync starts in between without it.
export const sendPresence = async (
  mx: MatrixClient,
  presence: PresenceChoice,
  statusMsg: string = getRememberedStatus(mx)
) => {
  await setSyncPresence(mx, presence);
  await putPresence(mx, presence, statusMsg);
};

/** Stores the status message and applies it to the current presence. */
export const saveStatusMessage = async (
  mx: MatrixClient,
  presence: PresenceChoice,
  status: string
) => {
  await mx.setAccountData(AccountDataEvent.PinnipedStatusMessage, { status });
  await sendPresence(mx, presence, status);
};

/** The user's own status: what the server reports, else the remembered message. */
export const useOwnStatus = (userId: string): string => {
  const presence = useUserPresence(userId);
  const event = useAccountData(AccountDataEvent.PinnipedStatusMessage);
  return presence?.status?.trim() || event?.getContent<StatusMessageContent>().status?.trim() || '';
};

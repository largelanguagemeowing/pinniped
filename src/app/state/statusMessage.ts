import { MatrixClient, SetPresence } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { useAccountData } from '../hooks/useAccountData';
import { useUserPresence } from '../hooks/useUserPresence';

type StatusMessageContent = { status?: string };

// Servers drop status_msg when presence goes offline or is replaced without one,
// so the user's message is kept in account data and re-sent with every change.
export const getRememberedStatus = (mx: MatrixClient): string =>
  mx.getAccountData(AccountDataEvent.PinnipedStatusMessage)?.getContent<StatusMessageContent>()
    ?.status ?? '';

type PresenceChoice = 'online' | 'unavailable' | 'offline';

const SYNC_PRESENCE: Record<PresenceChoice, SetPresence> = {
  online: SetPresence.Online,
  unavailable: SetPresence.Unavailable,
  offline: SetPresence.Offline,
};

// A /sync without set_presence counts as online (Synapse), which would undo the choice at the next
// request, so every sync carries it too; set first, so no sync starts in between without it.
export const sendPresence = async (
  mx: MatrixClient,
  presence: PresenceChoice,
  statusMsg: string = getRememberedStatus(mx)
) => {
  await mx.setSyncPresence(SYNC_PRESENCE[presence]);
  await mx.setPresence({ presence, status_msg: statusMsg });
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

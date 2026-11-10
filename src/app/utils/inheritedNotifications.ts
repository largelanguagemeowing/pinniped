import { IContent, MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import type { RoomNotificationMode } from '../hooks/useRoomsNotificationPreferences';

/**
 * Rooms whose push rule was written on a space's behalf (see
 * `notificationDefaults.ts`), by the room mode that rule carries. Such a rule
 * follows the space; a rule that is not recorded here is the user's own.
 */
export type InheritedNotifications = Record<
  string,
  RoomNotificationMode.SpecialMessages | RoomNotificationMode.Mute
>;

export const parseInheritedNotifications = (content?: IContent): InheritedNotifications =>
  Object.fromEntries(
    Object.entries(content?.rooms ?? {}).filter(
      ([, mode]) => mode === 'SpecialMessages' || mode === 'Mute'
    )
  ) as InheritedNotifications;

export const getInheritedNotifications = (mx: MatrixClient): InheritedNotifications =>
  parseInheritedNotifications(
    mx.getAccountData(AccountDataEvent.PinnipedInheritedNotifications)?.getContent()
  );

export const setInheritedNotifications = (
  mx: MatrixClient,
  rooms: InheritedNotifications
): Promise<unknown> =>
  mx.setAccountData(AccountDataEvent.PinnipedInheritedNotifications, { rooms });

/** The user chose a mode for the room themselves, so it stops following its space. */
export const forgetInheritedNotification = async (
  mx: MatrixClient,
  roomId: string
): Promise<void> => {
  const { [roomId]: dropped, ...rest } = getInheritedNotifications(mx);
  if (dropped) await setInheritedNotifications(mx, rest);
};

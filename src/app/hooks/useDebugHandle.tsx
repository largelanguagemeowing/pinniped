import { useEffect } from 'react';
import { NotificationCountType, ReceiptType } from 'matrix-js-sdk';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { useMatrixClient } from './useMatrixClient';

/** With developer tools on, exposes the client and an unread inspector on `window` for the console. */
export function DebugHandle() {
  const mx = useMatrixClient();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  useEffect(() => {
    if (!developerTools) return undefined;
    const target = window as unknown as Record<string, unknown>;
    target.mx = mx;
    target.unreadDebug = (roomId: string) => {
      const room = mx.getRoom(roomId);
      const userId = mx.getSafeUserId();
      if (!room) return undefined;
      return {
        upTo: room.getEventReadUpTo(userId),
        upToServerOnly: room.getEventReadUpTo(userId, true),
        public: room.getReadReceiptForUserId(userId, false, ReceiptType.Read),
        publicServer: room.getReadReceiptForUserId(userId, true, ReceiptType.Read),
        private: room.getReadReceiptForUserId(userId, false, ReceiptType.ReadPrivate),
        privateServer: room.getReadReceiptForUserId(userId, true, ReceiptType.ReadPrivate),
        counts: [
          room.getUnreadNotificationCount(NotificationCountType.Total),
          room.getUnreadNotificationCount(NotificationCountType.Highlight),
        ],
        last: room
          .getLiveTimeline()
          .getEvents()
          .slice(-5)
          .map((e) => [e.getId(), e.getSender(), e.getType(), e.getTs()]),
      };
    };
    return () => {
      delete target.mx;
      delete target.unreadDebug;
    };
  }, [mx, developerTools]);

  return null;
}

import { useEffect, useMemo, useState } from 'react';
import { User, UserEvent, UserEventHandlerMap } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';

export enum Presence {
  Online = 'online',
  Unavailable = 'unavailable',
  Offline = 'offline',
}

export type UserPresence = {
  presence: Presence;
  status?: string;
  active: boolean;
  lastActiveTs?: number;
};

const getUserPresence = (user: User): UserPresence => ({
  presence: user.presence as Presence,
  status: user.presenceStatusMsg,
  active: user.currentlyActive,
  lastActiveTs: user.getLastActiveTs(),
});

export const useUserPresence = (userId: string): UserPresence | undefined => {
  const mx = useMatrixClient();
  const user = mx.getUser(userId);

  const [presence, setPresence] = useState(() => (user ? getUserPresence(user) : undefined));

  useEffect(() => {
    // Re-sync state whenever the resolved user changes identity. Virtualized
    // room lists rebind rows to other rooms (keyed by index), so a row can
    // switch partners without remounting; without this the previous user's
    // presence would linger until the new user's next presence event.
    setPresence(user ? getUserPresence(user) : undefined);
    if (!user) return () => undefined;

    const updatePresence: UserEventHandlerMap[UserEvent.Presence] = (event, u) => {
      if (u.userId === user.userId) {
        setPresence(getUserPresence(user));
      }
    };
    user.on(UserEvent.Presence, updatePresence);
    user.on(UserEvent.CurrentlyActive, updatePresence);
    user.on(UserEvent.LastPresenceTs, updatePresence);
    return () => {
      user.removeListener(UserEvent.Presence, updatePresence);
      user.removeListener(UserEvent.CurrentlyActive, updatePresence);
      user.removeListener(UserEvent.LastPresenceTs, updatePresence);
    };
  }, [user]);

  return presence;
};

export const usePresenceLabel = (): Record<Presence, string> =>
  useMemo(
    () => ({
      [Presence.Online]: 'Active',
      [Presence.Unavailable]: 'Away',
      [Presence.Offline]: 'Offline',
    }),
    []
  );

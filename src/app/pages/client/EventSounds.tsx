import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { EventType, MatrixEvent, RelationType, RoomEvent, User, UserEvent } from 'matrix-js-sdk';
import { EventStatus } from 'matrix-js-sdk/lib/models/event-status';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { callEmbedAtom } from '../../state/callEmbed';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { playEventSound } from '../../sound/play';

/** Opt-in bundle sounds for events the app has no notification for. */
export function EventSounds() {
  const mx = useMatrixClient();
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);
  const wasJoinedRef = useRef(false);

  useEffect(() => {
    playEventSound('signin');
  }, []);

  // Joined, not merely embedded: the embed exists from the moment a call is requested.
  useEffect(() => {
    if (joined === wasJoinedRef.current) return;
    wasJoinedRef.current = joined;
    // Joining plays nothing here. A ringing outgoing call plays its start sound ahead of the
    // ringback (the widget's intro), and a channel, which rings nobody, plays none.
    if (!joined) playEventSound('callEnd');
  }, [joined]);

  useEffect(() => {
    const onLocalEcho = (mEvent: MatrixEvent) => {
      if (mEvent.getSender() !== mx.getUserId()) return;
      if (mEvent.status !== EventStatus.SENT) return;
      if (mEvent.getType() !== EventType.RoomMessage) return;
      if (mEvent.isRelation(RelationType.Replace)) return;
      playEventSound('sent');
    };
    mx.on(RoomEvent.LocalEchoUpdated, onLocalEcho);
    return () => {
      mx.removeListener(RoomEvent.LocalEchoUpdated, onLocalEcho);
    };
  }, [mx]);

  useEffect(() => {
    // Only contacts you have a DM with: presence for every user on the server would be noise.
    const lastOnline = new Map<string, boolean>();
    const onPresence = (_event: MatrixEvent | undefined, user: User) => {
      if (user.userId === mx.getUserId()) return;
      const online = user.presence === 'online';
      const was = lastOnline.get(user.userId);
      lastOnline.set(user.userId, online);
      if (was === undefined || was === online) return;
      const direct = mx.getAccountData(EventType.Direct)?.getContent() ?? {};
      if (!(user.userId in direct)) return;
      playEventSound(online ? 'online' : 'offline');
    };
    mx.on(UserEvent.Presence, onPresence);
    return () => {
      mx.removeListener(UserEvent.Presence, onPresence);
    };
  }, [mx]);

  return null;
}

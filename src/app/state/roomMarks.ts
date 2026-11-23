import { useMemo } from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { useAccountData } from '../hooks/useAccountData';

type RoomMarksContent = {
  /** roomId -> timestamp (ms) of the mark */
  rooms?: Record<string, number>;
};

type MarkType = Extract<
  AccountDataEvent,
  'club.stablecat.pinniped.left_rooms' | 'club.stablecat.pinniped.auto_join_settled'
>;

const parseMarks = (content?: RoomMarksContent): Record<string, number> => {
  const rooms = content?.rooms;
  if (!rooms || typeof rooms !== 'object') return {};
  return Object.fromEntries(Object.entries(rooms).filter(([, ts]) => typeof ts === 'number'));
};

// Bounds account data growth; the oldest marks are dropped first.
const MAX_MARKS = 2000;

const pruneMarks = (rooms: Record<string, number>): Record<string, number> => {
  const entries = Object.entries(rooms);
  if (entries.length <= MAX_MARKS) return rooms;
  entries.sort(([, a], [, b]) => b - a);
  return Object.fromEntries(entries.slice(0, MAX_MARKS));
};

/**
 * A set of rooms kept in one account data event, so it syncs across devices.
 * Writes are serialised per type so concurrent updates don't clobber each other.
 */
export const createRoomMarks = (type: MarkType) => {
  const get = (mx: MatrixClient): Record<string, number> =>
    parseMarks(mx.getAccountData(type)?.getContent<RoomMarksContent>());

  let queue: Promise<unknown> = Promise.resolve();

  const update = (
    mx: MatrixClient,
    change: (rooms: Record<string, number>) => Record<string, number> | undefined
  ): Promise<unknown> => {
    queue = queue
      .catch(() => undefined)
      .then(() => {
        const rooms = change(get(mx));
        if (!rooms) return undefined;
        return mx.setAccountData(type, { rooms: pruneMarks(rooms) });
      });
    return queue;
  };

  const mark = (mx: MatrixClient, roomIds: string[]): Promise<unknown> =>
    update(mx, (rooms) => {
      const fresh = roomIds.filter((id) => !(id in rooms));
      if (fresh.length === 0) return undefined;
      const now = Date.now();
      return { ...rooms, ...Object.fromEntries(fresh.map((id) => [id, now])) };
    });

  const unmark = (mx: MatrixClient, roomIds: string[]): Promise<unknown> =>
    update(mx, (rooms) => {
      if (!roomIds.some((id) => id in rooms)) return undefined;
      return Object.fromEntries(Object.entries(rooms).filter(([id]) => !roomIds.includes(id)));
    });

  const useMarks = (): Set<string> => {
    const event = useAccountData(type);
    return useMemo(
      () => new Set(Object.keys(parseMarks(event?.getContent<RoomMarksContent>()))),
      [event]
    );
  };

  return { get, mark, unmark, useMarks };
};

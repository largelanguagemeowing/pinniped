import React from 'react';
import { act, create } from 'react-test-renderer';
import { createClient, EventType, MatrixEvent, Room } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  useLiveEventArrive,
  useLiveTimelineRefresh,
  useRedactionRerender,
} from '../../src/app/features/room/liveTimelineEvents';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = '@me:x';
const OTHER = '@other:x';

const msg = (id: string) =>
  new MatrixEvent({
    event_id: id,
    sender: OTHER,
    type: EventType.RoomMessage,
    content: { msgtype: 'm.text', body: id },
    origin_server_ts: 1,
  });

const redaction = (id: string, redacts: string) =>
  new MatrixEvent({
    event_id: id,
    sender: OTHER,
    type: EventType.RoomRedaction,
    redacts,
    content: {},
    origin_server_ts: 2,
  });

const setup = () => {
  const client = createClient({ baseUrl: 'https://x.invalid', userId: ME, accessToken: 't' });
  const room = new Room('!r:x', client, ME);
  room.addLiveEvents([msg('$a'), msg('$b')], { addToState: false } as any);
  const onArrive = vi.fn();
  const onRedaction = vi.fn();
  const onRefresh = vi.fn();
  function Probe() {
    useLiveEventArrive(room, onArrive);
    useRedactionRerender(room, onRedaction);
    useLiveTimelineRefresh(room, onRefresh);
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return { room, onArrive, onRedaction, onRefresh };
};

describe('live timeline events', () => {
  it('counts a remote redaction as one arrival and still re-renders for the redacted event', () => {
    const { room, onArrive, onRedaction } = setup();
    room.addLiveEvents([redaction('$r', '$b')], { addToState: false } as any);
    expect(room.findEventById('$b')?.isRedacted()).toBe(true);
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect(onArrive.mock.calls[0][0].getId()).toBe('$r');
    expect(onRedaction).toHaveBeenCalledTimes(1);
  });

  it('re-attaches after a sync gap resets the live timeline', () => {
    const { room, onRefresh } = setup();
    room.getUnfilteredTimelineSet().resetLiveTimeline('b', 'f');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores resets of timeline sets other than the room timeline', () => {
    const { room, onRefresh } = setup();
    room.emit('Room.timelineReset' as any, room, { other: true } as any, true);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

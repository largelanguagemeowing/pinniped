import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { MatrixEvent, EventType, RoomEvent } from 'matrix-js-sdk';
import { MatrixRTCSessionEvent, type MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc';
import { firstValueFrom } from 'rxjs';
import { ReactionsReader } from '../../../src/app/plugins/call/engine/reactions/ReactionsReader';
import { ObservableScope } from '../../../src/app/plugins/call/engine/state/ObservableScope';

const ROOM = '!room:example.org';
const hand = '🖐️';

type Member = { userId: string; deviceId: string; eventId: string };

/** A session with the room and client the reader listens to, and the given participants. */
const setup = (initial: Member[]) => {
  const room = Object.assign(new EventEmitter(), {
    roomId: ROOM,
    client: Object.assign(new EventEmitter(), {
      decryptEventIfNeeded: async () => undefined,
    }),
    relations: { getChildEventsForEvent: () => undefined },
  });
  const session = Object.assign(new EventEmitter(), { room, memberships: initial });
  const scope = new ObservableScope();
  const reader = new ReactionsReader(scope, session as unknown as MatrixRTCSession);
  return {
    reader,
    scope,
    setMembers: (members: Member[]) => {
      session.memberships = members;
      session.emit(MatrixRTCSessionEvent.MembershipsChanged, []);
    },
    receive: (event: MatrixEvent) => room.emit(RoomEvent.Timeline, event),
    hands: async () => Object.keys(await firstValueFrom(reader.raisedHands$)),
  };
};

const alice: Member = { userId: '@alice:example.org', deviceId: 'A1', eventId: '$join-alice' };
const bob: Member = { userId: '@bob:example.org', deviceId: 'B1', eventId: '$join-bob' };

const reaction = (sender: string, id: string, content: object) =>
  new MatrixEvent({
    type: EventType.Reaction,
    sender,
    event_id: id,
    room_id: ROOM,
    content,
  });
const raise = (m: Member, id: string) =>
  reaction(m.userId, id, {
    'm.relates_to': { rel_type: 'm.annotation', event_id: m.eventId, key: hand },
  });

describe('ReactionsReader raised hands', () => {
  it('shows a hand raised by a participant', async () => {
    const t = setup([alice, bob]);
    t.receive(raise(alice, '$hand-alice'));
    expect(await t.hands()).toEqual(['@alice:example.org:A1']);
    t.scope.end();
  });

  it('lowers the hand of a participant who leaves the call', async () => {
    const t = setup([alice, bob]);
    t.receive(raise(alice, '$hand-alice'));
    t.receive(raise(bob, '$hand-bob'));
    t.setMembers([bob]);
    expect(await t.hands()).toEqual(['@bob:example.org:B1']);
    t.scope.end();
  });

  it.each([
    ['a redacted reaction, whose content is pruned', {}],
    ['a reaction without an event to relate to', { 'm.relates_to': { key: hand } }],
  ])('ignores %s', async (_, content) => {
    const t = setup([alice]);
    expect(() => t.receive(reaction(alice.userId, '$bad', content))).not.toThrow();
    expect(await t.hands()).toEqual([]);
    t.scope.end();
  });
});

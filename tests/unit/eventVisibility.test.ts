import { EventType, M_POLL_END, MatrixEvent } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import {
  isEventHidden,
  type EventVisibilityOpts,
} from '../../src/app/features/room/eventVisibility';

const opts = (over: Partial<EventVisibilityOpts> = {}): EventVisibilityOpts => ({
  ignoredUsers: new Set(['@ignored:x']),
  showHiddenEvents: false,
  hideMembershipEvents: false,
  hideNickAvatarEvents: false,
  hasRenderer: (t) => t === EventType.RoomMessage || t === EventType.RoomMember,
  ...over,
});

const ev = (e: Record<string, unknown>) =>
  new MatrixEvent({ event_id: '$e', sender: '@a:x', origin_server_ts: 1, content: {}, ...e });

const message = ev({ type: EventType.RoomMessage, content: { msgtype: 'm.text', body: 'hi' } });

describe('isEventHidden', () => {
  it('shows a plain message', () => {
    expect(isEventHidden(message, opts())).toBe(false);
  });

  it('hides ignored senders, relations and redaction events', () => {
    const ignored = ev({
      type: EventType.RoomMessage,
      sender: '@ignored:x',
      content: { body: 'x' },
    });
    const reaction = ev({
      type: EventType.Reaction,
      content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$m', key: 'x' } },
    });
    const redaction = ev({ type: EventType.RoomRedaction, redacts: '$m' });
    expect(isEventHidden(ignored, opts())).toBe(true);
    expect(isEventHidden(reaction, opts())).toBe(true);
    expect(isEventHidden(redaction, opts({ showHiddenEvents: true }))).toBe(true);
  });

  it('follows the membership settings', () => {
    const join = ev({
      type: EventType.RoomMember,
      state_key: '@a:x',
      content: { membership: 'join' },
      unsigned: { prev_content: { membership: 'invite' } },
    });
    const rename = ev({
      type: EventType.RoomMember,
      state_key: '@a:x',
      content: { membership: 'join', displayname: 'b' },
      unsigned: { prev_content: { membership: 'join', displayname: 'a' } },
    });
    expect(isEventHidden(join, opts({ hideMembershipEvents: true }))).toBe(true);
    expect(isEventHidden(join, opts({ hideNickAvatarEvents: true }))).toBe(false);
    expect(isEventHidden(rename, opts({ hideNickAvatarEvents: true }))).toBe(true);
    expect(isEventHidden(rename, opts({ hideMembershipEvents: true }))).toBe(false);
  });

  it('hides a poll end that points at no poll', () => {
    const orphan = ev({ type: M_POLL_END.name });
    const ended = ev({
      type: M_POLL_END.name,
      content: { 'm.relates_to': { rel_type: 'm.reference', event_id: '$poll' } },
    });
    expect(isEventHidden(orphan, opts())).toBe(true);
    expect(isEventHidden(ended, opts())).toBe(false);
  });

  it('hides events without a renderer unless hidden events are shown', () => {
    const state = ev({ type: 'm.room.power_levels', state_key: '', content: { users: {} } });
    const custom = ev({ type: 'x.custom', content: { a: 1 } });
    const empty = ev({ type: 'x.custom' });
    expect(isEventHidden(state, opts())).toBe(true);
    expect(isEventHidden(custom, opts())).toBe(true);
    expect(isEventHidden(state, opts({ showHiddenEvents: true }))).toBe(false);
    expect(isEventHidden(custom, opts({ showHiddenEvents: true }))).toBe(false);
    expect(isEventHidden(empty, opts({ showHiddenEvents: true }))).toBe(true);
  });
});

// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { useRoomPinnedEvents } from '../../src/app/hooks/useRoomPinnedEvents';
import { Reply } from '../../src/app/components/message/Reply';

const state = vi.hoisted(() => ({
  pinned: undefined as unknown,
  replyContent: {} as Record<string, unknown>,
}));

vi.mock('../../src/app/hooks/useStateEvent', () => ({
  useStateEvent: () => ({ getContent: () => ({ pinned: state.pinned }) }),
}));
vi.mock('../../src/app/hooks/useRoomEvent', () => ({
  useRoomEvent: () => ({
    getContent: () => state.replyContent,
    getSender: () => '@a:x',
    isRedacted: () => false,
  }),
}));
vi.mock('jotai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: () => new Set<string>(),
}));
vi.mock('../../src/app/state/mDirectList', () => ({ mDirectAtom: {} }));
// styles and the markup renderer are not what is under test
vi.mock('../../src/app/components/message/Reply.css', () => ({
  Reply: 'r',
  ReplyContent: 'rc',
  ThreadIndicator: 't',
}));
vi.mock('../../src/app/components/message/placeholder', () => ({ LinePlaceholder: () => null }));
vi.mock('../../src/app/components/message/content', () => ({
  MessageBadEncryptedContent: () => null,
  MessageDeletedContent: () => null,
  MessageFailedContent: () => null,
}));
vi.mock('../../src/app/plugins/react-custom-html-parser', () => ({
  scaleSystemEmoji: (text: string) => text,
}));

const pinnedOf = (pinned: unknown): string[] => {
  state.pinned = pinned;
  let result: string[] = [];
  function Probe() {
    result = useRoomPinnedEvents({} as never);
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return result;
};

describe('pinned events from a room that stores any shape', () => {
  it.each([
    ['a string', 'x'],
    ['an object', { a: 1 }],
    ['a number', 7],
    [undefined, undefined],
  ])('is no pins for %s', (_name, pinned) => {
    expect(pinnedOf(pinned)).toEqual([]);
  });

  it('keeps only the string ids of an array', () => {
    expect(pinnedOf(['$a', 1, null, {}, '$b'])).toEqual(['$a', '$b']);
  });
});

describe('Reply to an event whose body is not a string', () => {
  it.each([123, true, { a: 1 }, ['x'], null])('renders for body %j', (body) => {
    state.replyContent = { body };
    const room = { roomId: '!r:x', getMember: () => null } as never;

    expect(() => {
      act(() => {
        create(<Reply room={room} replyEventId="$e" />);
      });
    }).not.toThrow();
  });
});

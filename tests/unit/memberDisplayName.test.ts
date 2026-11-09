import { describe, expect, it } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import { getMemberDisplayName } from '../../src/app/utils/room';

const roomWithMembers = (members: Record<string, string>) =>
  ({
    getMember: (userId: string) =>
      userId in members ? { rawDisplayName: members[userId], userId } : null,
  }) as unknown as Room;

const userId = '@alice:example.org';

describe('getMemberDisplayName', () => {
  it('returns the display name', () => {
    expect(getMemberDisplayName(roomWithMembers({ [userId]: 'Alice' }), userId)).toBe('Alice');
  });

  it('removes override characters that would reverse the name', () => {
    // "Bob" after U+202E would otherwise show as "boB".
    expect(getMemberDisplayName(roomWithMembers({ [userId]: 'Bob\u202E' }), userId)).toBe('Bob');
  });

  it('treats a name made only of invisible characters as no name', () => {
    expect(getMemberDisplayName(roomWithMembers({ [userId]: '\u202E\u2066' }), userId)).toBe(
      undefined
    );
  });

  it('returns undefined when the member name is the user id or the member is unknown', () => {
    expect(getMemberDisplayName(roomWithMembers({ [userId]: userId }), userId)).toBe(undefined);
    expect(getMemberDisplayName(roomWithMembers({}), userId)).toBe(undefined);
  });
});

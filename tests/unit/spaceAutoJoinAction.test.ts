import { describe, expect, it } from 'vitest';
import { getAutoJoinAction } from '../../src/app/utils/spaceAutoJoin';

const child = (joined: boolean, settled: boolean, leftExplicitly = false) => ({
  joined,
  settled,
  leftExplicitly,
});

describe('getAutoJoinAction', () => {
  it('joins a room it has never handled', () => {
    expect(getAutoJoinAction(child(false, false))).toBe('join');
  });

  it('does not join a settled room we are not in (left on any client)', () => {
    expect(getAutoJoinAction(child(false, true))).toBe('skip');
  });

  it('does not join a room left explicitly', () => {
    expect(getAutoJoinAction(child(false, false, true))).toBe('skip');
  });

  it('records a joined room it has not seen before, so a later leave sticks', () => {
    expect(getAutoJoinAction(child(true, false))).toBe('settle');
  });

  it('leaves a joined, settled room alone', () => {
    expect(getAutoJoinAction(child(true, true))).toBe('skip');
  });
});

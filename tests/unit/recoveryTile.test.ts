import { describe, expect, it } from 'vitest';
import { recoveryTileState } from '../../src/app/utils/recoveryTile';

describe('recoveryTileState', () => {
  it('manages recovery when it is on, whatever else is known', () => {
    for (const identity of ['present', 'absent', 'unknown'] as const) {
      expect(recoveryTileState(true, identity)).toBe('manage');
    }
  });

  it('offers a full setup only when the account has no identity at all', () => {
    expect(recoveryTileState(false, 'absent')).toBe('setup');
  });

  it('offers to turn recovery back on, not to set up, when an identity already exists', () => {
    expect(recoveryTileState(false, 'present')).toBe('turnOn');
  });

  it('offers nothing that could replace an identity until it is known', () => {
    expect(recoveryTileState(false, 'unknown')).toBe('checking');
  });
});

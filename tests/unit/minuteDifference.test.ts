import { describe, expect, it } from 'vitest';
import { minuteDifference } from '../../src/app/utils/time';

describe('minuteDifference', () => {
  it('is the exact gap in minutes', () => {
    expect(minuteDifference(0, 90_000)).toBe(1.5);
    expect(minuteDifference(90_000, 0)).toBe(1.5);
  });

  it('keeps a gap under two minutes below two', () => {
    // messages up to 2 minutes apart share a block
    expect(minuteDifference(0, 119_000)).toBeLessThan(2);
    expect(minuteDifference(0, 120_000)).toBe(2);
  });
});

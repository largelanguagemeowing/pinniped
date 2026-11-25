import { describe, expect, it } from 'vitest';
import {
  millisecondsToMinutesAndSeconds,
  secondsToMinutesAndSeconds,
} from '../../src/app/utils/common';

describe('duration labels', () => {
  it('carries a seconds field that rounds up to 60 into the minutes', () => {
    expect(secondsToMinutesAndSeconds(59.7)).toBe('1:00');
    expect(secondsToMinutesAndSeconds(119.6)).toBe('2:00');
  });

  it('rounds to the nearest second otherwise', () => {
    expect(secondsToMinutesAndSeconds(0)).toBe('0:00');
    expect(secondsToMinutesAndSeconds(9.4)).toBe('0:09');
    expect(secondsToMinutesAndSeconds(61.2)).toBe('1:01');
  });

  it('never shows 60 seconds for milliseconds', () => {
    expect(millisecondsToMinutesAndSeconds(59_900)).toBe('0:59');
    expect(millisecondsToMinutesAndSeconds(119_900)).toBe('1:59');
    expect(millisecondsToMinutesAndSeconds(60_000)).toBe('1:00');
  });
});

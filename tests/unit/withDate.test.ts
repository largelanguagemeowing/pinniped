import dayjs from 'dayjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getYesterday, withDate, withTime } from '../../src/app/utils/time';

// New York changes clocks on 2026-03-08 (spring) and 2026-11-01 (autumn)
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

const at = (s: string) => dayjs(s).valueOf();
const fmt = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm');

describe('withDate', () => {
  it('keeps the time of day when the move crosses the spring clock change', () => {
    expect(fmt(withDate(at('2026-03-01T12:30'), 2026, 3, 14))).toBe('2026-03-14 12:30');
  });

  it('keeps the time of day when the move crosses the autumn clock change', () => {
    expect(fmt(withDate(at('2026-10-20T12:30'), 2026, 11, 10))).toBe('2026-11-10 12:30');
  });

  it('is undone by moving back', () => {
    const start = at('2026-03-14T12:30');
    expect(withDate(withDate(start, 2026, 3, 1), 2026, 3, 14)).toBe(start);
  });

  it('moves to the last day of a shorter month', () => {
    expect(fmt(withDate(at('2026-03-31T09:00'), 2026, 2, 31))).toBe('2026-02-28 09:00');
    expect(fmt(withDate(at('2024-02-29T09:00'), 2025, 2, 29))).toBe('2025-02-28 09:00');
  });
});

describe('withTime', () => {
  it('sets the hour and minute on a day with a clock change', () => {
    expect(fmt(withTime(at('2026-03-08T00:15'), 14, 20))).toBe('2026-03-08 14:20');
    expect(fmt(withTime(at('2026-11-01T00:15'), 14, 20))).toBe('2026-11-01 14:20');
  });
});

describe('getYesterday', () => {
  it('is midnight of the calendar day before today', () => {
    const yesterday = dayjs(getYesterday());
    expect(yesterday.format('HH:mm')).toBe('00:00');
    expect(dayjs().startOf('day').diff(yesterday, 'day')).toBe(1);
  });
});

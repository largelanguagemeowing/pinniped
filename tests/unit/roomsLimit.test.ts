import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ROOMS_LIMIT,
  MAX_ROOMS_LIMIT,
  parseRoomsLimit,
} from '../../src/app/pages/client/explore/roomsLimit';

describe('parseRoomsLimit', () => {
  it('takes a page size in range as it is', () => {
    expect(parseRoomsLimit('48')).toBe(48);
    expect(parseRoomsLimit('1')).toBe(1);
  });

  it.each([undefined, '', ' ', '-24', '0', 'abc', '1.5', '12px', 'NaN', 'Infinity'])(
    'falls back for %j',
    (param) => {
      expect(parseRoomsLimit(param)).toBe(FALLBACK_ROOMS_LIMIT);
    }
  );

  it('caps a huge page size', () => {
    expect(parseRoomsLimit('99999999')).toBe(MAX_ROOMS_LIMIT);
    expect(parseRoomsLimit('1e9')).toBe(FALLBACK_ROOMS_LIMIT);
  });
});

import { describe, expect, it } from 'vitest';

import {
  orderByRecency,
  pickStripPeople,
  SpeechLog,
  STRIP_RECENT_MS,
  type StripCandidate,
} from '../../../src/app/features/call/stage/grid/stripOrder';

const NOW = 1_000_000;
const person = (id: string, extra: Partial<StripCandidate> = {}): StripCandidate => ({
  id,
  local: false,
  speaking: false,
  lastSpoke: null,
  ...extra,
});
const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe('orderByRecency', () => {
  it('puts people talking now first, then those who just spoke, the latest first', () => {
    const items = [
      person('quiet'),
      person('earlier', { lastSpoke: NOW - 8_000 }),
      person('later', { lastSpoke: NOW - 2_000 }),
      person('talking', { speaking: true, lastSpoke: NOW - 500 }),
      person('talking-longer', { speaking: true, lastSpoke: NOW - 4_000 }),
    ];
    expect(ids(orderByRecency(items, NOW))).toEqual([
      'talking',
      'talking-longer',
      'later',
      'earlier',
      'quiet',
    ]);
  });

  it('keeps the given order for everyone who has not spoken within the window', () => {
    const items = [
      person('a'),
      person('b', { lastSpoke: NOW - STRIP_RECENT_MS }),
      person('c', { lastSpoke: NOW - STRIP_RECENT_MS - 1 }),
      person('d'),
    ];
    expect(ids(orderByRecency(items, NOW))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not move yourself up when you talk', () => {
    const items = [
      person('first'),
      person('me', { local: true, speaking: true, lastSpoke: NOW }),
      person('last'),
    ];
    expect(ids(orderByRecency(items, NOW))).toEqual(['first', 'me', 'last']);
  });

  it('does not change the input', () => {
    const items = [person('a'), person('b', { speaking: true, lastSpoke: NOW })];
    orderByRecency(items, NOW);
    expect(ids(items)).toEqual(['a', 'b']);
  });
});

describe('pickStripPeople', () => {
  it('shows only as many people as there are slots, best first', () => {
    const items = [person('a'), person('b'), person('c', { speaking: true, lastSpoke: NOW })];
    expect(ids(pickStripPeople(items, 2, NOW).tiles)).toEqual(['c', 'a']);
  });

  it('shows nobody with no slots', () => {
    expect(pickStripPeople([person('a')], 0, NOW).tiles).toEqual([]);
  });

  it('gives a new speaker a freed slot rather than moving everyone along', () => {
    const quiet = [person('a'), person('b'), person('c'), person('d')];
    const first = pickStripPeople(quiet, 3, NOW);
    expect(ids(first.tiles)).toEqual(['a', 'b', 'c']);

    // d starts talking: d is picked and c, the lowest, drops out. a and b stay put.
    const talking = [...quiet.slice(0, 3), person('d', { speaking: true, lastSpoke: NOW })];
    const second = pickStripPeople(talking, 3, NOW, first.slots);
    expect(ids(second.tiles)).toEqual(['a', 'b', 'd']);
  });

  it('keeps a shown person in place when they start talking', () => {
    const quiet = [person('a'), person('b'), person('c')];
    const first = pickStripPeople(quiet, 3, NOW);
    const talking = [person('a'), person('b'), person('c', { speaking: true, lastSpoke: NOW })];
    expect(ids(pickStripPeople(talking, 3, NOW, first.slots).tiles)).toEqual(['a', 'b', 'c']);
  });

  it('closes the gap when someone leaves and fills it with the next in line', () => {
    const items = [person('a'), person('b'), person('c'), person('d')];
    const first = pickStripPeople(items, 3, NOW);
    const without = items.filter((i) => i.id !== 'a');
    const second = pickStripPeople(without, 3, NOW, first.slots);
    expect(ids(second.tiles)).toEqual(['d', 'b', 'c']);
  });

  it('assigns every shown person exactly one slot, with no gaps', () => {
    const first = pickStripPeople([person('a'), person('b'), person('c')], 3, NOW);
    expect([...first.slots.values()].sort()).toEqual([0, 1, 2]);
    // Fewer people than slots, and slots remembered from a wider strip.
    const second = pickStripPeople([person('c'), person('a')], 5, NOW, first.slots);
    expect([...second.slots.values()].sort()).toEqual([0, 1]);
  });

  it('ignores remembered slots that no longer exist after the strip shrinks', () => {
    const first = pickStripPeople([person('a'), person('b'), person('c'), person('d')], 4, NOW);
    const second = pickStripPeople(
      [person('a'), person('b'), person('c'), person('d')],
      2,
      NOW,
      first.slots
    );
    expect(ids(second.tiles)).toEqual(['a', 'b']);
  });
});

describe('SpeechLog', () => {
  it('records when speech starts and stops', () => {
    const log = new SpeechLog();
    expect(log.note('a', true, 100)).toBe(true);
    expect(log.speaking('a')).toBe(true);
    expect(log.lastSpoke('a')).toBe(100);
    expect(log.note('a', false, 250)).toBe(true);
    expect(log.speaking('a')).toBe(false);
    expect(log.lastSpoke('a')).toBe(250);
  });

  it('ignores repeats and silence from someone never heard', () => {
    const log = new SpeechLog();
    expect(log.note('a', false, 100)).toBe(false);
    expect(log.lastSpoke('a')).toBeNull();
    log.note('a', true, 100);
    expect(log.note('a', true, 200)).toBe(false);
    expect(log.lastSpoke('a')).toBe(100);
  });

  it('reports when the next "just spoke" status runs out', () => {
    const log = new SpeechLog();
    log.note('a', true, 0);
    log.note('b', true, 0);
    log.note('a', false, 1_000);
    log.note('b', false, 3_000);
    expect(log.nextExpiry(2_000)).toBe(1_000 + STRIP_RECENT_MS);
    expect(log.nextExpiry(1_000 + STRIP_RECENT_MS)).toBe(3_000 + STRIP_RECENT_MS);
    expect(log.nextExpiry(3_000 + STRIP_RECENT_MS)).toBeNull();
  });

  it('has nothing to expire while someone is still talking', () => {
    const log = new SpeechLog();
    log.note('a', true, 0);
    expect(log.nextExpiry(5_000)).toBeNull();
  });

  it('forgets people who left', () => {
    const log = new SpeechLog();
    log.note('a', true, 0);
    log.note('b', true, 0);
    log.keepOnly(new Set(['b']));
    expect(log.lastSpoke('a')).toBeNull();
    expect(log.lastSpoke('b')).toBe(0);
  });
});

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** How long after they stop talking someone still counts as having just spoken. */
export const STRIP_RECENT_MS = 10_000;

export interface StripCandidate {
  id: string;
  /** Yourself: keeps the position the call gave you instead of moving up when you talk. */
  local: boolean;
  speaking: boolean;
  /**
   * When speech last started while `speaking`, else when it last stopped;
   * null for someone who has not spoken since the strip began watching.
   */
  lastSpoke: number | null;
}

/** 0: talking now, 1: spoke within `STRIP_RECENT_MS`, 2: everyone else. */
const rank = (c: StripCandidate, now: number): 0 | 1 | 2 => {
  if (c.local || c.lastSpoke === null) return 2;
  if (c.speaking) return 0;
  return now - c.lastSpoke < STRIP_RECENT_MS ? 1 : 2;
};

/**
 * Put the people who are talking or just talked first, the latest first. Everyone else
 * (and yourself) keeps the order given, which is the call's own (shares, hands, video).
 */
export function orderByRecency<T extends StripCandidate>(items: readonly T[], now: number): T[] {
  return items
    .map((item, index) => ({ item, index, rank: rank(item, now) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 2) return a.index - b.index;
      const diff = b.item.lastSpoke! - a.item.lastSpoke!;
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface StripPeople<T> {
  /** Who the strip shows, in slot order. */
  tiles: T[];
  /** The slot of each shown person, to pass back in as `previous`. */
  slots: ReadonlyMap<string, number>;
}

/**
 * Pick the `capacity` people to show and give each a slot. Someone already shown keeps
 * their slot while they stay in the picked set, so a new speaker takes a freed slot and
 * does not push everyone along; newcomers fill the free slots in priority order.
 */
export function pickStripPeople<T extends StripCandidate>(
  items: readonly T[],
  capacity: number,
  now: number,
  previous: ReadonlyMap<string, number> = new Map()
): StripPeople<T> {
  const picked = orderByRecency(items, now).slice(0, Math.max(0, capacity));
  const slotted: (T | undefined)[] = new Array<T | undefined>(picked.length).fill(undefined);
  const newcomers: T[] = [];
  picked.forEach((item) => {
    const slot = previous.get(item.id);
    if (slot !== undefined && slot < slotted.length && slotted[slot] === undefined)
      slotted[slot] = item;
    else newcomers.push(item);
  });
  slotted.forEach((item, slot) => {
    if (item === undefined) slotted[slot] = newcomers.shift();
  });
  const tiles = slotted.filter((item): item is T => item !== undefined);
  return { tiles, slots: new Map(tiles.map((item, slot) => [item.id, slot])) };
}

/** Remembers when each person last spoke. Times come from the caller so tests control them. */
export class SpeechLog {
  private readonly last = new Map<string, { speaking: boolean; at: number }>();

  /** Records a change; returns whether it changed anything. */
  note(id: string, speaking: boolean, at: number): boolean {
    const known = this.last.get(id);
    if (known === undefined && !speaking) return false;
    if (known?.speaking === speaking) return false;
    this.last.set(id, { speaking, at });
    return true;
  }

  speaking(id: string): boolean {
    return this.last.get(id)?.speaking ?? false;
  }

  lastSpoke(id: string): number | null {
    return this.last.get(id)?.at ?? null;
  }

  /** When someone's "just spoke" status next runs out, or null if none will. */
  nextExpiry(now: number): number | null {
    let next: number | null = null;
    this.last.forEach(({ speaking, at }) => {
      const end = at + STRIP_RECENT_MS;
      if (!speaking && end > now && (next === null || end < next)) next = end;
    });
    return next;
  }

  /** Drops people who are no longer in the call. */
  keepOnly(ids: ReadonlySet<string>): void {
    this.last.forEach((_, id) => {
      if (!ids.has(id)) this.last.delete(id);
    });
  }
}

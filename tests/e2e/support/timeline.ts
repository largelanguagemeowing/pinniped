import type { Page } from '@playwright/test';
import { matrixRequest } from './matrix';

/** Sends `count` text messages one after another (so they keep their order) and returns their event IDs. */
export async function seedMessages(
  page: Page,
  roomId: string,
  count: number,
  text: (index: number) => string
): Promise<string[]> {
  return page.evaluate(
    async ({ roomId: id, count: n, texts }) => {
      const homeserver = localStorage.getItem('cinny_hs_base_url');
      const accessToken = localStorage.getItem('cinny_access_token');
      if (!homeserver || !accessToken) throw new Error('Missing authenticated Matrix session');
      const eventIds: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(id)}/send/m.room.message/seed-${Date.now()}-${i}`;
        let response = await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype: 'm.text', body: texts[i] }),
        });
        for (let retry = 0; response.status === 429 && retry < 10; retry += 1) {
          const { retry_after_ms: wait = 500 } = await response.json().catch(() => ({}));
          await new Promise((resolve) => {
            setTimeout(resolve, Math.min(wait, 5_000));
          });
          response = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ msgtype: 'm.text', body: texts[i] }),
          });
        }
        if (!response.ok) throw new Error(`send ${i} failed (${response.status})`);
        eventIds.push((await response.json()).event_id);
      }
      return eventIds;
    },
    { roomId, count, texts: Array.from({ length: count }, (_, i) => text(i)) }
  );
}

/** Sends one message through the API as the signed-in person; returns its event ID. */
export async function sendMessageViaApi(page: Page, roomId: string, body: string): Promise<string> {
  const result = await matrixRequest<{ event_id: string }>(page, {
    method: 'PUT',
    path: `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/api-${Date.now()}-${Math.random()}`,
    body: { msgtype: 'm.text', body },
  });
  if (!result) throw new Error('send returned nothing');
  return result.event_id;
}

export type ScrollSample = {
  /** ms since the recording started */
  t: number;
  scrollTop: number;
  distanceFromBottom: number;
  /** the first message that reaches into the viewport, and where its top sits in it */
  anchorId: string | null;
  anchorTop: number | null;
  /** rendered message rows */
  rows: number;
};

/**
 * Installs a per-frame recorder on the timeline's scroll element; `stopScrollRecorder` returns
 * what it saw. Everything runs in the page, so the samples are real frames, not polled values.
 */
export async function startScrollRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const first = document.querySelector('[data-message-item]');
    let scroller: HTMLElement | null = first?.parentElement ?? null;
    while (scroller && getComputedStyle(scroller).overflowY !== 'scroll') {
      scroller = scroller.parentElement;
    }
    if (!scroller) throw new Error('Timeline scroll element not found');
    const el = scroller;
    const samples: ScrollSample[] = [];
    const t0 = performance.now();
    let running = true;
    const frame = () => {
      if (!running) return;
      const box = el.getBoundingClientRect();
      const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-message-item]'));
      const anchor = rows.find((row) => row.getBoundingClientRect().bottom > box.top + 1);
      samples.push({
        t: performance.now() - t0,
        scrollTop: el.scrollTop,
        distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
        anchorId: anchor?.getAttribute('data-message-id') ?? null,
        anchorTop: anchor ? anchor.getBoundingClientRect().top - box.top : null,
        rows: rows.length,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (window as unknown as { __scrollRecorder: unknown }).__scrollRecorder = {
      stop: () => {
        running = false;
        return samples;
      },
    };
  });
}

export async function stopScrollRecorder(page: Page): Promise<ScrollSample[]> {
  return page.evaluate(() =>
    (window as unknown as { __scrollRecorder: { stop: () => unknown } }).__scrollRecorder.stop()
  ) as Promise<ScrollSample[]>;
}

/**
 * Frames where the same row moved against the reader's scroll: while scrolling up a row only ever
 * moves down the viewport, so a row that moves up, or that moves down by more than `maxStepPx`
 * in one frame, is a layout jump.
 */
export function findScrollJumps(
  samples: ScrollSample[],
  { direction, maxStepPx }: { direction: 'up' | 'down'; maxStepPx: number }
): { t: number; id: string; delta: number }[] {
  const jumps: { t: number; id: string; delta: number }[] = [];
  const sign = direction === 'up' ? 1 : -1;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (!prev.anchorId || prev.anchorId !== cur.anchorId) continue;
    if (prev.anchorTop === null || cur.anchorTop === null) continue;
    const delta = (cur.anchorTop - prev.anchorTop) * sign;
    if (delta < -2 || delta > maxStepPx) jumps.push({ t: cur.t, id: cur.anchorId, delta });
  }
  return jumps;
}

/** Runs `fn` in the page with the timeline's scroll element. */
export function withTimelineScroller<T, A = undefined>(
  page: Page,
  fn: (scroller: HTMLElement, arg: A) => T,
  arg?: A
): Promise<T> {
  return page.evaluate(
    ({ source, argument }) => {
      const first = document.querySelector('[data-message-item]');
      let scroller: HTMLElement | null = first?.parentElement ?? null;
      while (scroller && getComputedStyle(scroller).overflowY !== 'scroll') {
        scroller = scroller.parentElement;
      }
      if (!scroller) throw new Error('Timeline scroll element not found');

      return new Function('scroller', 'arg', `return (${source})(scroller, arg)`)(
        scroller,
        argument
      );
    },
    { source: fn.toString(), argument: arg }
  );
}

export const distanceFromBottom = (page: Page): Promise<number> =>
  withTimelineScroller(page, (s) => s.scrollHeight - s.scrollTop - s.clientHeight);

export const scrollTop = (page: Page): Promise<number> =>
  withTimelineScroller(page, (s) => s.scrollTop);

/** A row that is in the viewport, and where its top sits there; null when none is. */
export const visibleRow = (page: Page): Promise<{ id: string; top: number } | null> =>
  withTimelineScroller(page, (s) => {
    const box = s.getBoundingClientRect();
    const rows = Array.from(s.querySelectorAll<HTMLElement>('[data-message-item]'));
    const row = rows.find((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top >= box.top && rect.bottom <= box.bottom;
    });
    return row
      ? {
          id: row.getAttribute('data-message-id') ?? '',
          top: row.getBoundingClientRect().top - box.top,
        }
      : null;
  });

/** Where the row with this event ID sits in the viewport; null when it is not rendered. */
export const rowTop = (page: Page, eventId: string): Promise<number | null> =>
  withTimelineScroller(
    page,
    (s, id) => {
      const row = Array.from(s.querySelectorAll<HTMLElement>('[data-message-id]')).find(
        (r) => r.getAttribute('data-message-id') === id
      );
      return row ? row.getBoundingClientRect().top - s.getBoundingClientRect().top : null;
    },
    eventId
  );

/**
 * Parks the pointer over the timeline's left gutter: inside the scroll area, away from the floating
 * "Jump to Latest" chip (bottom centre) and the hover toolbar (top right), which would otherwise
 * swallow the wheel events aimed at the timeline.
 */
export async function pointAtTimeline(page: Page): Promise<void> {
  const box = await withTimelineScroller(page, (s) => {
    const r = s.getBoundingClientRect();
    return { x: r.left, y: r.top, height: r.height };
  });
  await page.mouse.move(box.x + 60, box.y + box.height / 3);
}

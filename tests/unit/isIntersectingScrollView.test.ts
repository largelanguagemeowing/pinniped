import { describe, expect, it } from 'vitest';
import { isIntersectingScrollView } from '../../src/app/utils/dom';

// a 500px viewport scrolled to 1000, in a scroll element at the top of its offset parent
const scroller = { offsetTop: 0, scrollTop: 1000, offsetHeight: 500 } as HTMLElement;
const child = (offsetTop: number, clientHeight = 50) =>
  ({ offsetTop, clientHeight }) as HTMLElement;

describe('isIntersectingScrollView', () => {
  it('is true for an element inside the viewport', () => {
    expect(isIntersectingScrollView(scroller, child(1200))).toBe(true);
  });

  it('is false for an element above or below the viewport', () => {
    expect(isIntersectingScrollView(scroller, child(900))).toBe(false);
    expect(isIntersectingScrollView(scroller, child(1600))).toBe(false);
  });

  it('counts an element that spans the whole viewport', () => {
    expect(isIntersectingScrollView(scroller, child(900, 800))).toBe(true);
  });

  it('widens the viewport by the margin on both sides', () => {
    expect(isIntersectingScrollView(scroller, child(800), 0)).toBe(false);
    expect(isIntersectingScrollView(scroller, child(800), 250)).toBe(true);
    expect(isIntersectingScrollView(scroller, child(1700), 0)).toBe(false);
    expect(isIntersectingScrollView(scroller, child(1700), 250)).toBe(true);
  });

  it('still excludes elements beyond the margin', () => {
    expect(isIntersectingScrollView(scroller, child(100), 250)).toBe(false);
    expect(isIntersectingScrollView(scroller, child(2500), 250)).toBe(false);
  });
});

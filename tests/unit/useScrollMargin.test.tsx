import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureOffsetWithin, useScrollMargin } from '../../src/app/hooks/useScrollMargin';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = (top: number, extra: object = {}) =>
  ({ getBoundingClientRect: () => ({ top }), children: [], ...extra }) as unknown as HTMLElement;

describe('measureOffsetWithin', () => {
  it('is the distance from the top of the scrolled content, whatever the scroll position', () => {
    // the container sits at y=50; the list at y=150 while scrolled 40px, so it is 140px into the content
    expect(measureOffsetWithin(box(50, { scrollTop: 40 }), box(150))).toBe(140);
    expect(measureOffsetWithin(box(50, { scrollTop: 0 }), box(100))).toBe(50);
  });
});

describe('useScrollMargin', () => {
  let resize: (() => void) | undefined;
  let observed: unknown[] = [];
  let disconnected = 0;

  beforeEach(() => {
    resize = undefined;
    observed = [];
    disconnected = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resize = cb;
        }

        observe(target: unknown) {
          observed.push(target);
        }

        disconnect() {
          disconnected += 1;
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('measures the list, re-measures when the content resizes, and stops observing on unmount', () => {
    const content = box(0);
    const scroll = box(0, { scrollTop: 0, children: [content] });
    let listTop = 120;
    const list = box(0);
    list.getBoundingClientRect = () => ({ top: listTop }) as DOMRect;
    const scrollRef = { current: scroll };

    let margin = -1;
    function Probe() {
      margin = useScrollMargin(scrollRef, list);
      return null;
    }

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe />);
    });
    expect(margin).toBe(120);
    expect(observed).toEqual([scroll, content]);

    listTop = 150;
    act(() => resize?.());
    expect(margin).toBe(150);

    act(() => renderer.unmount());
    expect(disconnected).toBe(1);
  });

  it('is zero without a list', () => {
    let margin = -1;
    function Probe() {
      margin = useScrollMargin({ current: box(0, { scrollTop: 0 }) }, null);
      return null;
    }
    act(() => {
      create(<Probe />);
    });
    expect(margin).toBe(0);
    expect(observed).toEqual([]);
  });
});

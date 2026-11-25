// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useVirtualPaginator } from '../../src/app/hooks/useVirtualPaginator';

class ObserverStub {
  observe = vi.fn();

  unobserve = vi.fn();

  disconnect = vi.fn();
}

const sized = (el: HTMLElement, box: { offsetTop: number; height: number }) => {
  Object.defineProperty(el, 'offsetTop', { value: box.offsetTop });
  Object.defineProperty(el, 'offsetHeight', { value: box.height });
  Object.defineProperty(el, 'clientHeight', { value: box.height });
  return el;
};

/** Renders the paginator over `count` items of which only `rendered` have an element. */
function render(count: number, rendered: Map<number, HTMLElement>) {
  const scroller = sized(document.createElement('div'), { offsetTop: 0, height: 600 });
  const scrollTo = vi.fn();
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  let scrollToItem!: ReturnType<typeof useVirtualPaginator>['scrollToItem'];
  // stable callbacks and range, as the timeline passes them; new ones would re-create the observers
  const range = { start: 0, end: count };
  const onRangeChange = () => {};
  const getScrollElement = () => scroller;
  const getItemElement = (index: number) => rendered.get(index);

  function Harness() {
    ({ scrollToItem } = useVirtualPaginator({
      count,
      limit: 20,
      range,
      onRangeChange,
      getScrollElement,
      getItemElement,
    }));
    return null;
  }
  act(() => {
    create(<Harness />);
  });
  return { scrollTo, scrollToItem: (...a: Parameters<typeof scrollToItem>) => scrollToItem(...a) };
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', ObserverStub);
  vi.stubGlobal('ResizeObserver', ObserverStub);
});
afterEach(() => vi.clearAllMocks());

describe('useVirtualPaginator scrollToItem', () => {
  it('centers the first item like any other', () => {
    const first = sized(document.createElement('div'), { offsetTop: 400, height: 100 });
    const { scrollTo, scrollToItem } = render(5, new Map([[0, first]]));

    expect(scrollToItem(0, { align: 'center', behavior: 'instant' })).toBe(true);

    // 400 - 600 / 2 + 100 / 2
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'instant' });
  });

  it('scrolls to the nearest rendered item before one that is not rendered', () => {
    const first = sized(document.createElement('div'), { offsetTop: 400, height: 100 });
    const { scrollTo, scrollToItem } = render(5, new Map([[0, first]]));

    scrollToItem(3, { align: 'start', behavior: 'instant' });

    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'instant' });
  });

  it('goes to the top when no item up to the target is rendered', () => {
    const later = sized(document.createElement('div'), { offsetTop: 400, height: 100 });
    const { scrollTo, scrollToItem } = render(5, new Map([[4, later]]));

    scrollToItem(2, { align: 'center', behavior: 'instant' });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });
});

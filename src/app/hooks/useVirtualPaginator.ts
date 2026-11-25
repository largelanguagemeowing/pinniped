import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { OnIntersectionCallback, useIntersectionObserver } from './useIntersectionObserver';
import { useResizeObserver } from './useResizeObserver';
import {
  canFitInScrollView,
  getScrollInfo,
  isInScrollView,
  isIntersectingScrollView,
} from '../utils/dom';

const PAGINATOR_ANCHOR_ATTR = 'data-paginator-anchor';

// Chromium and Firefox keep the visible content in place when the content above it changes (CSS
// scroll anchoring). A script that sets the scroll position instead cancels the wheel or touch
// gesture in progress, so a flick that reaches unloaded history stops dead. Browsers without
// anchoring (Safari) keep the manual restore below.
const NATIVE_SCROLL_ANCHORING =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('overflow-anchor', 'auto')
    : false;

// Pagination starts this far (in viewport heights) before the reader reaches the end of the
// rendered items, so the next page is usually there before they do.
const PREFETCH_VIEWPORTS = 1;

export enum Direction {
  Backward = 'B',
  Forward = 'F',
}

export type ItemRange = {
  start: number;
  end: number;
};

export type ScrollToOptions = {
  offset?: number;
  align?: 'start' | 'center' | 'end';
  behavior?: 'auto' | 'instant' | 'smooth';
  stopInView?: boolean;
};

/**
 * Scrolls the page to a specified element in the DOM.
 *
 * @param {HTMLElement} element - The DOM element to scroll to.
 * @param {ScrollToOptions} [opts] - Optional configuration for the scroll behavior (e.g., smooth scrolling, alignment).
 * @returns {boolean} - Returns `true` if the scroll was successful, otherwise returns `false`.
 */
export type ScrollToElement = (element: HTMLElement, opts?: ScrollToOptions) => boolean;

/**
 * Scrolls the page to an item at the specified index within a scrollable container.
 *
 * @param {number} index - The index of the item to scroll to.
 * @param {ScrollToOptions} [opts] - Optional configuration for the scroll behavior (e.g., smooth scrolling, alignment).
 * @returns {boolean} - Returns `true` if the scroll was successful, otherwise returns `false`.
 */
export type ScrollToItem = (index: number, opts?: ScrollToOptions) => boolean;

type HandleObserveAnchor = (element: HTMLElement | null) => void;

type VirtualPaginatorOptions<TScrollElement extends HTMLElement> = {
  count: number;
  limit: number;
  range: ItemRange;
  onRangeChange: (range: ItemRange) => void;
  getScrollElement: () => TScrollElement | null;
  getItemElement: (index: number) => HTMLElement | undefined;
  onEnd?: (back: boolean) => void;
};

type VirtualPaginator = {
  getItems: () => number[];
  scrollToElement: ScrollToElement;
  scrollToItem: ScrollToItem;
  observeBackAnchor: HandleObserveAnchor;
  observeFrontAnchor: HandleObserveAnchor;
};

const generateItems = (range: ItemRange) => {
  const items: number[] = [];
  for (let i = range.start; i < range.end; i += 1) {
    items.push(i);
  }

  return items;
};

const getDropIndex = (
  scrollEl: HTMLElement,
  range: ItemRange,
  dropDirection: Direction,
  getItemElement: (index: number) => HTMLElement | undefined,
  pageThreshold = 1
): number | undefined => {
  const fromBackward = dropDirection === Direction.Backward;
  const items = fromBackward ? generateItems(range) : generateItems(range).reverse();

  const { viewHeight, top, height } = getScrollInfo(scrollEl);
  const { offsetTop: sOffsetTop } = scrollEl;
  const bottom = top + viewHeight;
  const dropEdgePx = fromBackward
    ? Math.max(top - viewHeight * pageThreshold, 0)
    : Math.min(bottom + viewHeight * pageThreshold, height);
  if (dropEdgePx === 0 || dropEdgePx === height) return undefined;

  let dropIndex: number | undefined;

  items.find((item) => {
    const el = getItemElement(item);
    if (!el) {
      dropIndex = item;
      return false;
    }
    const { clientHeight } = el;
    const offsetTop = el.offsetTop - sOffsetTop;
    const offsetBottom = offsetTop + clientHeight;
    const isInView = fromBackward ? offsetBottom > dropEdgePx : offsetTop < dropEdgePx;
    if (isInView) return true;
    dropIndex = item;
    return false;
  });

  return dropIndex;
};

type RestoreAnchorData = [number | undefined, HTMLElement | undefined];
const getRestoreAnchor = (
  range: ItemRange,
  getItemElement: (index: number) => HTMLElement | undefined,
  direction: Direction
): RestoreAnchorData => {
  let scrollAnchorEl: HTMLElement | undefined;
  const scrollAnchorItem = (
    direction === Direction.Backward ? generateItems(range) : generateItems(range).reverse()
  ).find((i) => {
    const el = getItemElement(i);
    if (el) {
      scrollAnchorEl = el;
      return true;
    }
    return false;
  });
  return [scrollAnchorItem, scrollAnchorEl];
};

const getRestoreScrollData = (scrollTop: number, restoreAnchorData: RestoreAnchorData) => {
  const [anchorItem, anchorElement] = restoreAnchorData;
  if (!anchorItem || !anchorElement) {
    return undefined;
  }
  return {
    scrollTop,
    anchorItem,
    anchorOffsetTop: anchorElement.offsetTop,
  };
};

const useObserveAnchorHandle = (
  intersectionObserver: ReturnType<typeof useIntersectionObserver>,
  anchorType: Direction
): HandleObserveAnchor =>
  useMemo<HandleObserveAnchor>(() => {
    let anchor: HTMLElement | null = null;
    return (element) => {
      if (element === anchor) return;
      if (anchor) intersectionObserver?.unobserve(anchor);
      if (!element) return;
      anchor = element;
      element.setAttribute(PAGINATOR_ANCHOR_ATTR, anchorType);
      intersectionObserver?.observe(element);
    };
  }, [intersectionObserver, anchorType]);

export const useVirtualPaginator = <TScrollElement extends HTMLElement>(
  options: VirtualPaginatorOptions<TScrollElement>
): VirtualPaginator => {
  const { count, limit, range, onRangeChange, getScrollElement, getItemElement, onEnd } = options;

  const initialRenderRef = useRef(true);

  const restoreScrollRef = useRef<{
    scrollTop: number;
    anchorOffsetTop: number;
    anchorItem: number;
  }>(undefined);

  const scrollToItemRef = useRef<{
    index: number;
    opts?: ScrollToOptions;
  }>(undefined);

  // Scroll anchor tracks the topmost visible item so we can compensate
  // for async content height changes (images loading, URL previews, etc.)
  // that shift content above the viewport and would otherwise cause the
  // view to jump.
  const scrollAnchorRef = useRef<{ index: number; offsetTop: number }>(undefined);

  const propRef = useRef({
    range,
    limit,
    count,
  });
  if (propRef.current.count !== count) {
    // Clear restoreScrollRef on count change
    // As restoreScrollRef.current.anchorItem might changes
    restoreScrollRef.current = undefined;
    scrollAnchorRef.current = undefined;
  }
  propRef.current = {
    range,
    count,
    limit,
  };

  const getItems = useMemo(() => {
    const items = generateItems(range);
    return () => items;
  }, [range]);

  const scrollToElement = useCallback<ScrollToElement>(
    (element, opts) => {
      const scrollElement = getScrollElement();
      if (!scrollElement) return false;

      if (opts?.stopInView && isInScrollView(scrollElement, element)) {
        return false;
      }
      let scrollTo = element.offsetTop;
      if (opts?.align === 'center' && canFitInScrollView(scrollElement, element)) {
        const scrollInfo = getScrollInfo(scrollElement);
        scrollTo =
          element.offsetTop -
          Math.round(scrollInfo.viewHeight / 2) +
          Math.round(element.clientHeight / 2);
      } else if (opts?.align === 'end' && canFitInScrollView(scrollElement, element)) {
        const scrollInfo = getScrollInfo(scrollElement);
        scrollTo = element.offsetTop - Math.round(scrollInfo.viewHeight) + element.clientHeight;
      }

      scrollElement.scrollTo({
        top: scrollTo - (opts?.offset ?? 0),
        behavior: opts?.behavior,
      });
      return true;
    },
    [getScrollElement]
  );

  const scrollToItem = useCallback<ScrollToItem>(
    (index, opts) => {
      const { range: currentRange, limit: currentLimit, count: currentCount } = propRef.current;

      if (index < 0 || index >= currentCount) return false;
      // index is not in range change range
      // and trigger scrollToItem in layoutEffect hook
      if (index < currentRange.start || index >= currentRange.end) {
        onRangeChange({
          start: Math.max(index - currentLimit, 0),
          end: Math.min(index + currentLimit, currentCount),
        });
        scrollToItemRef.current = {
          index,
          opts,
        };
        return true;
      }

      // find target or it's previous rendered element to scroll to
      const targetItems = generateItems({ start: currentRange.start, end: index + 1 });
      const targetItem = targetItems.reverse().find((i) => getItemElement(i) !== undefined);
      const itemElement = targetItem === undefined ? undefined : getItemElement(targetItem);

      if (!itemElement) {
        const scrollElement = getScrollElement();
        scrollElement?.scrollTo({
          top: opts?.offset ?? 0,
          behavior: opts?.behavior,
        });
        return true;
      }
      return scrollToElement(itemElement, opts);
    },
    [getScrollElement, scrollToElement, getItemElement, onRangeChange]
  );

  const paginate = useCallback(
    (direction: Direction) => {
      const scrollEl = getScrollElement();
      const { range: currentRange, limit: currentLimit, count: currentCount } = propRef.current;
      let { start, end } = currentRange;

      if (direction === Direction.Backward) {
        restoreScrollRef.current = undefined;
        if (start === 0) {
          onEnd?.(true);
          return;
        }
        if (scrollEl) {
          restoreScrollRef.current = getRestoreScrollData(
            scrollEl.scrollTop,
            getRestoreAnchor({ start, end }, getItemElement, Direction.Backward)
          );
        }
        if (scrollEl) {
          end = getDropIndex(scrollEl, currentRange, Direction.Forward, getItemElement, 2) ?? end;
        }
        start = Math.max(start - currentLimit, 0);
      }

      if (direction === Direction.Forward) {
        restoreScrollRef.current = undefined;
        if (end === currentCount) {
          onEnd?.(false);
          return;
        }
        if (scrollEl) {
          restoreScrollRef.current = getRestoreScrollData(
            scrollEl.scrollTop,
            getRestoreAnchor({ start, end }, getItemElement, Direction.Forward)
          );
        }
        end = Math.min(end + currentLimit, currentCount);
        if (scrollEl) {
          start =
            getDropIndex(scrollEl, currentRange, Direction.Backward, getItemElement, 2) ?? start;
        }
      }

      onRangeChange({
        start,
        end,
      });
    },
    [getScrollElement, getItemElement, onEnd, onRangeChange]
  );

  const handlePaginatorElIntersection: OnIntersectionCallback = useCallback(
    (entries) => {
      const anchorB = entries.find(
        (entry) => entry.target.getAttribute(PAGINATOR_ANCHOR_ATTR) === Direction.Backward
      );
      if (anchorB?.isIntersecting) {
        paginate(Direction.Backward);
      }
      const anchorF = entries.find(
        (entry) => entry.target.getAttribute(PAGINATOR_ANCHOR_ATTR) === Direction.Forward
      );
      if (anchorF?.isIntersecting) {
        paginate(Direction.Forward);
      }
    },
    [paginate]
  );

  const intersectionObserver = useIntersectionObserver(
    handlePaginatorElIntersection,
    useCallback(
      () => ({
        root: getScrollElement(),
        rootMargin: `${PREFETCH_VIEWPORTS * 100}% 0px`,
      }),
      [getScrollElement]
    )
  );

  const observeBackAnchor = useObserveAnchorHandle(intersectionObserver, Direction.Backward);
  const observeFrontAnchor = useObserveAnchorHandle(intersectionObserver, Direction.Forward);

  // Restore scroll when local pagination.
  // restoreScrollRef.current only gets set
  // when paginate() changes range itself
  useLayoutEffect(() => {
    const scrollEl = getScrollElement();
    if (!restoreScrollRef.current || !scrollEl) return;
    const {
      anchorOffsetTop: oldOffsetTop,
      anchorItem,
      scrollTop: oldScrollTop,
    } = restoreScrollRef.current;
    // Anchoring cannot hold a position at offset 0: nothing is above it to keep. The reader is
    // at the edge there, so no gesture is left to cancel.
    if (NATIVE_SCROLL_ANCHORING && oldScrollTop > 0) {
      restoreScrollRef.current = undefined;
      return;
    }
    const anchorEl = getItemElement(anchorItem);

    if (!anchorEl) return;
    const { offsetTop } = anchorEl;
    const offsetAddition = offsetTop - oldOffsetTop;
    const restoreTop = oldScrollTop + offsetAddition;

    scrollEl.scrollTo({
      top: restoreTop,
      behavior: 'instant',
    });
    restoreScrollRef.current = undefined;
    // Clear scroll anchor so the ResizeObserver callback does not undo
    // the scroll restoration we just performed.
    scrollAnchorRef.current = undefined;
  }, [range, getScrollElement, getItemElement]);

  // When scrollToItem index was not in range.
  // Scroll to item after range changes.
  useLayoutEffect(() => {
    if (scrollToItemRef.current === undefined) return;
    const { index, opts } = scrollToItemRef.current;
    scrollToItem(index, {
      ...opts,
      behavior: 'instant',
    });
    scrollToItemRef.current = undefined;
  }, [range, scrollToItem]);

  // Asks for the next page when a pagination anchor is within reach of the viewport.
  const paginateIfAnchorNear = useCallback(() => {
    const scrollElement = getScrollElement();
    if (!scrollElement) return;
    const backAnchor = scrollElement.querySelector(
      `[${PAGINATOR_ANCHOR_ATTR}="${Direction.Backward}"]`
    ) as HTMLElement | null;
    const frontAnchor = scrollElement.querySelector(
      `[${PAGINATOR_ANCHOR_ATTR}="${Direction.Forward}"]`
    ) as HTMLElement | null;

    const margin = scrollElement.clientHeight * PREFETCH_VIEWPORTS;
    if (backAnchor && isIntersectingScrollView(scrollElement, backAnchor, margin)) {
      paginate(Direction.Backward);
      return;
    }
    if (frontAnchor && isIntersectingScrollView(scrollElement, frontAnchor, margin)) {
      paginate(Direction.Forward);
    }
  }, [getScrollElement, paginate]);

  // The intersection observer only reports changes, so it cannot see an anchor that is already
  // in reach when a page arrives (or that came back into reach while the page was loading). After
  // every range change, check the anchors directly to keep filling the view.
  useEffect(() => {
    if (initialRenderRef.current) {
      // Do not trigger pagination on initial render
      // anchor intersection observable will trigger pagination on mount
      initialRenderRef.current = false;
      return;
    }
    paginateIfAnchorNear();
  }, [range, paginateIfAnchorNear]);

  // The same check while scrolling: a reader who settles within reach of an anchor after the last
  // range change (a scroll animation ending at the edge) produces no intersection change.
  useEffect(() => {
    const scrollElement = getScrollElement();
    if (!scrollElement) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paginateIfAnchorNear();
      });
    };
    scrollElement.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [getScrollElement, paginateIfAnchorNear]);

  // Without native scroll anchoring: track the topmost visible item on scroll so it can serve as
  // the anchor when async content height changes occur (images loading, URL previews resolving).
  useEffect(() => {
    const scrollEl = getScrollElement();
    if (NATIVE_SCROLL_ANCHORING || !scrollEl) return undefined;

    const updateAnchor = () => {
      const items = getItems();
      const sOffsetTop = scrollEl.offsetTop;
      const anchorItem = items.find((item) => {
        const el = getItemElement(item);
        if (!el) return false;
        const offsetBottom = el.offsetTop - sOffsetTop + el.clientHeight;
        return offsetBottom > scrollEl.scrollTop;
      });
      if (anchorItem !== undefined) {
        const el = getItemElement(anchorItem);
        if (el) {
          scrollAnchorRef.current = { index: anchorItem, offsetTop: el.offsetTop };
        }
      }
    };

    scrollEl.addEventListener('scroll', updateAnchor, { passive: true });
    updateAnchor();
    return () => scrollEl.removeEventListener('scroll', updateAnchor);
  }, [getScrollElement, getItems, getItemElement]);

  // Adjust scroll position when async content height changes shift items
  // above the viewport. This fires after the DOM has been updated but before
  // the next paint, so the user should not see a visible jump.
  useResizeObserver(
    useMemo(
      () => () => {
        const scrollEl = getScrollElement();
        if (NATIVE_SCROLL_ANCHORING || !scrollEl || !scrollAnchorRef.current) return;

        // Skip if the user is at (or near) the bottom. The at-bottom logic
        // in the host component handles scrolling to the new bottom.
        const distanceFromBottom =
          scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
        if (distanceFromBottom <= 1) return;

        const { index, offsetTop: oldOffsetTop } = scrollAnchorRef.current;
        const el = getItemElement(index);
        // The anchor item may have been dropped by pagination.
        if (!el) {
          scrollAnchorRef.current = undefined;
          return;
        }
        const newOffsetTop = el.offsetTop;
        if (newOffsetTop !== oldOffsetTop) {
          scrollEl.scrollTop += newOffsetTop - oldOffsetTop;
          scrollAnchorRef.current.offsetTop = newOffsetTop;
        }
      },
      [getScrollElement, getItemElement]
    ),
    useCallback(() => getScrollElement()?.firstElementChild as Element | null, [getScrollElement])
  );

  return {
    getItems,
    scrollToItem,
    scrollToElement,
    observeBackAnchor,
    observeFrontAnchor,
  };
};

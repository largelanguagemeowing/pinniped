import { RefObject, useLayoutEffect, useState } from 'react';

/** Distance from the top of the scrolled content to `element`, in px. */
export const measureOffsetWithin = (scroll: HTMLElement, element: HTMLElement): number =>
  element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;

/**
 * Where `list` starts inside `scrollRef`, for a virtualizer whose list is not the first thing
 * in its scroll container (`scrollMargin`). Re-measured when the scroll container or its
 * content changes size, which is when anything above the list can have moved it.
 */
export const useScrollMargin = (
  scrollRef: RefObject<HTMLElement | null>,
  list: HTMLElement | null
): number => {
  const [margin, setMargin] = useState(0);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !list) {
      setMargin(0);
      return undefined;
    }
    const measure = () => setMargin(measureOffsetWithin(scroll, list));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    Array.from(scroll.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [scrollRef, list]);

  return margin;
};

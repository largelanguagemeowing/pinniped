import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useResizeObserver } from '../../../hooks/useResizeObserver';
import { useLowAnimationMode } from '../../../hooks/useLowAnimationMode';
import { recordStage } from './renderTrail';

export interface ElementRect {
  x: number;
  y: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

const emptyRect: ElementRect = { x: 0, y: 0, top: 0, bottom: 0, width: 0, height: 0 };

const sameRect = (a: ElementRect, b: ElementRect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const rectOf = (element: Element): ElementRect => {
  const { x, y, top, bottom, width, height } = element.getBoundingClientRect();
  return { x, y, top, bottom, width, height };
};

/**
 * The element's bounding box in the viewport, updated when it resizes or the window does
 * (not on scroll).
 */
export function useElementRect(element: Element | null): ElementRect {
  const [rect, setRect] = useState(emptyRect);
  const update = useCallback(() => {
    if (!element) return;
    const next = rectOf(element);
    recordStage('measure rect', `${next.width}x${next.height}@${next.x},${next.y}`);
    setRect((prev) => (sameRect(prev, next) ? prev : next));
  }, [element]);

  useResizeObserver(update, element);
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  return element ? rect : emptyRect;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The room tiles get in a scroll container: its size without the vertical scrollbar, which
 * tiles sized to the full width would slide underneath.
 */
export function useScrollerSize(scroller: HTMLElement | null): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const update = useCallback(() => {
    if (!scroller) return;
    const { width, height } = scroller.getBoundingClientRect();
    const scrollbar = scroller.offsetWidth - scroller.clientWidth;
    const next = { width: Math.max(0, width - scrollbar), height };
    recordStage('measure scroller', `${next.width}x${next.height} scrollbar ${scrollbar}`);
    setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
  }, [scroller]);

  useResizeObserver(update, scroller);
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  return size;
}

const reducedMotionQuery = '(prefers-reduced-motion)';
const subscribeReducedMotion = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Whether animations should be skipped: the system asks for it or Pinniped's low animation mode is on. */
export function useReducedMotion(): boolean {
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches
  );
  const lowAnimation = useLowAnimationMode();
  return prefersReduced || lowAnimation === true;
}

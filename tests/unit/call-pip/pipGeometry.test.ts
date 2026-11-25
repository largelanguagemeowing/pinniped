import { describe, expect, it } from 'vitest';

import {
  PIP_DEFAULT_WIDTH,
  PIP_INSETS,
  PIP_MAX_WIDTH,
  PIP_MIN_WIDTH,
  cornerPosition,
  dragVelocity,
  fitPipWidth,
  isDragging,
  isPipCorner,
  maxPipWidthIn,
  pipHeight,
  releaseCorner,
  resizedPipWidth,
  snapPipWidth,
} from '../../../src/app/features/call-pip/pipGeometry';

const viewport = { width: 1600, height: 900 };

describe('snapPipWidth', () => {
  it('settles on a multiple of 40 within the limits', () => {
    expect(snapPipWidth(333)).toBe(320);
    expect(snapPipWidth(341)).toBe(360);
    expect(snapPipWidth(10)).toBe(PIP_MIN_WIDTH);
    expect(snapPipWidth(5000)).toBe(PIP_MAX_WIDTH);
  });

  it('falls back to the default for a width that is not a number', () => {
    expect(snapPipWidth(Number.NaN)).toBe(PIP_DEFAULT_WIDTH);
    expect(snapPipWidth(Number.POSITIVE_INFINITY)).toBe(PIP_DEFAULT_WIDTH);
  });
});

describe('fitPipWidth', () => {
  it('keeps a width that fits between the side insets', () => {
    expect(fitPipWidth(480, 1600)).toBe(480);
  });

  it('reduces a width the viewport has become too small for', () => {
    // 700 - 160 = 540 of room, snapped down to 520.
    expect(maxPipWidthIn(700)).toBe(520);
    expect(fitPipWidth(900, 700)).toBe(520);
  });

  it('never goes below the minimum, even in a tiny viewport', () => {
    expect(fitPipWidth(320, 100)).toBe(PIP_MIN_WIDTH);
  });
});

describe('cornerPosition', () => {
  const size = { width: 320, height: pipHeight(320) };

  it('rests each corner at its inset from the viewport edges', () => {
    const { top, bottom, left, right } = PIP_INSETS;
    expect(cornerPosition('top-left', viewport, size)).toEqual({ x: left, y: top });
    expect(cornerPosition('top-right', viewport, size)).toEqual({
      x: viewport.width - right - 320,
      y: top,
    });
    expect(cornerPosition('bottom-left', viewport, size)).toEqual({
      x: left,
      y: Math.round(viewport.height - bottom - size.height),
    });
    expect(cornerPosition('bottom-right', viewport, size)).toEqual({
      x: viewport.width - right - 320,
      y: Math.round(viewport.height - bottom - size.height),
    });
  });

  it('keeps the window inside the viewport for every corner', () => {
    (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).forEach((corner) => {
      const p = cornerPosition(corner, viewport, size);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + size.width).toBeLessThanOrEqual(viewport.width);
      expect(p.y + size.height).toBeLessThanOrEqual(viewport.height);
    });
  });
});

describe('releaseCorner', () => {
  const still = { x: 0, y: 0 };
  // A point window: the position is then the centre as well
  const point = { width: 0, height: 0 };

  it('picks the corner of the half the window rests in', () => {
    expect(releaseCorner({ x: 100, y: 100 }, still, viewport, point)).toBe('top-left');
    expect(releaseCorner({ x: 1200, y: 100 }, still, viewport, point)).toBe('top-right');
    expect(releaseCorner({ x: 100, y: 700 }, still, viewport, point)).toBe('bottom-left');
    expect(releaseCorner({ x: 1200, y: 700 }, still, viewport, point)).toBe('bottom-right');
  });

  it('lets a fling carry the window across the middle', () => {
    // At x=700 (left half) moving right at 2 px/ms reaches 700 + 400 = 1100, the right half.
    expect(releaseCorner({ x: 700, y: 100 }, { x: 2, y: 0 }, viewport, point)).toBe('top-right');
    expect(releaseCorner({ x: 900, y: 100 }, { x: -2, y: 0 }, viewport, point)).toBe('top-left');
    expect(releaseCorner({ x: 100, y: 300 }, { x: 0, y: 3 }, viewport, point)).toBe('bottom-left');
  });

  it('classifies by the window centre, so a wide window dragged in its corner stays there', () => {
    const wide = { width: 680, height: pipHeight(680) };
    const wideViewport = { width: 1440, height: 900 };
    (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).forEach((corner) => {
      const rest = cornerPosition(corner, wideViewport, wide);
      expect(releaseCorner(rest, still, wideViewport, wide)).toBe(corner);
    });
  });

  it('counts exactly the middle as the left and top half', () => {
    expect(releaseCorner({ x: 800, y: 450 }, still, viewport, point)).toBe('top-left');
  });
});

describe('resizedPipWidth', () => {
  it('grows when the handle is dragged away from the corner', () => {
    // Anchored right: the handle is on the left, so dragging left (negative) grows it.
    expect(resizedPipWidth(320, -80, 'bottom-right')).toBe(400);
    expect(resizedPipWidth(320, 80, 'top-left')).toBe(400);
  });

  it('shrinks the other way and stays within the limits', () => {
    expect(resizedPipWidth(320, 80, 'bottom-right')).toBe(240);
    expect(resizedPipWidth(320, 1000, 'bottom-right')).toBe(PIP_MIN_WIDTH);
  });

  it('may overshoot the maximum a little before release settles it', () => {
    expect(resizedPipWidth(900, -500, 'top-right')).toBe(PIP_MAX_WIDTH + 20);
    expect(snapPipWidth(PIP_MAX_WIDTH + 20)).toBe(PIP_MAX_WIDTH);
  });
});

describe('dragVelocity and isDragging', () => {
  it('measures px per ms over the samples', () => {
    expect(
      dragVelocity([
        { x: 0, y: 0, t: 0 },
        { x: 50, y: -20, t: 50 },
        { x: 100, y: -40, t: 100 },
      ])
    ).toEqual({ x: 1, y: -0.4 });
  });

  it('is zero with too little to go on', () => {
    expect(dragVelocity([])).toEqual({ x: 0, y: 0 });
    expect(dragVelocity([{ x: 5, y: 5, t: 10 }])).toEqual({ x: 0, y: 0 });
    expect(
      dragVelocity([
        { x: 0, y: 0, t: 10 },
        { x: 9, y: 9, t: 10 },
      ])
    ).toEqual({ x: 0, y: 0 });
  });

  it('starts a drag only after more than 3 px of movement', () => {
    expect(isDragging({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(isDragging({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(isDragging({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isDragging({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(true);
  });
});

describe('isPipCorner', () => {
  it('accepts only the four corners', () => {
    expect(isPipCorner('bottom-right')).toBe(true);
    expect(isPipCorner('middle')).toBe(false);
    expect(isPipCorner(3)).toBe(false);
    expect(isPipCorner(undefined)).toBe(false);
  });
});

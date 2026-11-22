/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The floating call window sits in one of the four corners of the app. */
export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const PIP_CORNERS: readonly PipCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];
export const DEFAULT_PIP_CORNER: PipCorner = 'bottom-right';

/** Width limits of the window; its height follows at 16:9. */
export const PIP_MIN_WIDTH = 200;
export const PIP_MAX_WIDTH = 960;
export const PIP_DEFAULT_WIDTH = 320;
/** A resized window settles on a multiple of this. */
export const PIP_WIDTH_STEP = 40;
export const PIP_ASPECT = 16 / 9;

/** How far the window keeps from each edge of the app in its corner (px). */
export const PIP_INSETS = { top: 80, bottom: 132, left: 80, right: 80 } as const;

/** How long ahead (ms) the release velocity is projected to choose the corner. */
export const PIP_FLING_MS = 200;
/** The pointer has to move this far (px) before a press becomes a drag. */
export const PIP_DRAG_THRESHOLD = 3;

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const pipHeight = (width: number): number => width / PIP_ASPECT;

export const isPipCorner = (value: unknown): value is PipCorner =>
  typeof value === 'string' && PIP_CORNERS.includes(value as PipCorner);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The width a resize settles on: a multiple of the step, within the limits. */
export function snapPipWidth(width: number): number {
  if (!Number.isFinite(width)) return PIP_DEFAULT_WIDTH;
  return clamp(PIP_WIDTH_STEP * Math.round(width / PIP_WIDTH_STEP), PIP_MIN_WIDTH, PIP_MAX_WIDTH);
}

/**
 * The widest the window may be in this viewport: it has to fit between the side insets.
 * Never below the minimum width (a very narrow window then overflows its insets instead).
 */
export function maxPipWidthIn(viewportWidth: number, insets: Insets = PIP_INSETS): number {
  // Rounded down: rounding to the nearest step could overflow the insets.
  const room =
    PIP_WIDTH_STEP * Math.floor((viewportWidth - (insets.left + insets.right)) / PIP_WIDTH_STEP);
  return Math.max(PIP_MIN_WIDTH, Math.min(PIP_MAX_WIDTH, room));
}

/** The stored width, reduced when the viewport got too small for it. */
export function fitPipWidth(width: number, viewportWidth: number): number {
  return Math.min(snapPipWidth(width), maxPipWidthIn(viewportWidth));
}

/** Where the window's top-left sits when it rests in `corner`. */
export function cornerPosition(
  corner: PipCorner,
  viewport: Size,
  size: Size,
  insets: Insets = PIP_INSETS
): Point {
  const left = corner === 'top-left' || corner === 'bottom-left';
  const top = corner === 'top-left' || corner === 'top-right';
  return {
    x: Math.round(left ? insets.left : viewport.width - insets.right - size.width),
    y: Math.round(top ? insets.top : viewport.height - insets.bottom - size.height),
  };
}

/**
 * The corner a released drag goes to: where the window would be `PIP_FLING_MS` from now at the
 * release velocity (px per ms), by which half of the viewport that is in.
 */
export function releaseCorner(position: Point, velocity: Point, viewport: Size): PipCorner {
  const x = position.x + PIP_FLING_MS * velocity.x;
  const y = position.y + PIP_FLING_MS * velocity.y;
  const left = !(x > viewport.width / 2);
  const top = !(y > viewport.height / 2);
  if (top) return left ? 'top-left' : 'top-right';
  return left ? 'bottom-left' : 'bottom-right';
}

/** Whether the corner is on the right, where the resize handle is on the window's left. */
export const isRightCorner = (corner: PipCorner): boolean =>
  corner === 'top-right' || corner === 'bottom-right';

/**
 * The live width while the resize handle is dragged by `deltaX` px. The handle is on the side
 * away from the corner, so dragging it outward grows the window. It may overshoot the maximum
 * a little; release settles it.
 */
export function resizedPipWidth(startWidth: number, deltaX: number, corner: PipCorner): number {
  const width = startWidth + deltaX * (isRightCorner(corner) ? -1 : 1);
  return clamp(width, PIP_MIN_WIDTH, PIP_MAX_WIDTH + 20);
}

/** Pointer positions (ms, px) kept to work out how fast a drag ended. */
export interface PointerSample extends Point {
  t: number;
}

/** Velocity in px per ms over the samples; zero for fewer than two or no time between them. */
export function dragVelocity(samples: readonly PointerSample[]): Point {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** Whether a press at `from` has moved far enough to count as a drag. */
export const isDragging = (from: Point, now: Point): boolean =>
  (now.x - from.x) ** 2 + (now.y - from.y) ** 2 > PIP_DRAG_THRESHOLD ** 2;

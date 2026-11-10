/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Subject } from "rxjs";

import { setAudioEnabled$ } from "./controls";
import { type GridMode } from "./state/CallViewModel/CallViewModel";

/**
 * What the embedding client can ask of the call view (the
 * `club.stablecat.pinniped.call_control` widget action). Every field is optional
 * and only the ones present are applied. The client draws the call controls
 * itself, so this is how its buttons reach the call.
 */
export type HostCallControl = {
  /** Switch between the grid and the spotlight layout. */
  layout?: GridMode;
  /** `false` ends this client's screen share. Starting one is its own action. */
  screenShare?: false;
  /** Whether the call's audio plays; `false` is deafened. */
  outputEnabled?: boolean;
  /** Whether the user has been idle, so the call view fades its labels. */
  idle?: boolean;
  /** Scrollbar colours of the client's theme, as CSS colours. */
  scrollbar?: { track: string; thumb: string };
};

/**
 * What the call view reports back (the `club.stablecat.pinniped.call_view`
 * widget action), whenever any of it changes.
 */
export type CallViewState = {
  layout: GridMode;
  /** Whether this client is sharing its screen. */
  screenSharing: boolean;
  /** Height in pixels of the screen share being watched, or null when there is none. */
  streamHeight: number | null;
};

/** The client asked for a layout. */
export const layoutRequest$ = new Subject<GridMode>();
/** The client asked to end this client's screen share. */
export const screenShareStop$ = new Subject<void>();
/** Height of the screen share shown in the spotlight, for {@link CallViewState}. */
export const streamHeight$ = new BehaviorSubject<number | null>(null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a `call_control` payload, dropping anything that is not what the action defines. */
export const parseHostCallControl = (data: unknown): HostCallControl => {
  if (!isRecord(data)) return {};
  const control: HostCallControl = {};
  if (data.layout === "grid" || data.layout === "spotlight")
    control.layout = data.layout;
  if (data.screenShare === false) control.screenShare = false;
  if (typeof data.outputEnabled === "boolean")
    control.outputEnabled = data.outputEnabled;
  if (typeof data.idle === "boolean") control.idle = data.idle;
  if (
    isRecord(data.scrollbar) &&
    typeof data.scrollbar.track === "string" &&
    typeof data.scrollbar.thumb === "string"
  )
    control.scrollbar = {
      track: data.scrollbar.track,
      thumb: data.scrollbar.thumb,
    };
  return control;
};

/** Applies a `call_control` request from the embedding client. */
export const applyHostCallControl = (
  data: unknown,
  root: HTMLElement = document.documentElement,
): void => {
  const control = parseHostCallControl(data);
  if (control.layout !== undefined) layoutRequest$.next(control.layout);
  if (control.screenShare === false) screenShareStop$.next();
  if (control.outputEnabled !== undefined)
    setAudioEnabled$.next(control.outputEnabled);
  if (control.idle !== undefined)
    root.dataset.pinnipedIdle = String(control.idle);
  if (control.scrollbar !== undefined) {
    root.style.setProperty(
      "--pinniped-scrollbar-track",
      control.scrollbar.track,
    );
    root.style.setProperty(
      "--pinniped-scrollbar-thumb",
      control.scrollbar.thumb,
    );
  }
};

/** How often, at most, the client is told that the user is active in the call view. */
const USER_ACTIVITY_INTERVAL_MS = 1000;
const USER_ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
] as const;

/**
 * Calls `report` when the user moves the pointer or types inside the call view,
 * at most once a second. The client cannot see input that lands in the widget,
 * and needs it to know whether the user is idle.
 */
export const reportUserActivity = (
  report: () => void,
  target: Pick<Document, "addEventListener" | "removeEventListener"> = document,
): (() => void) => {
  let last = -Infinity;
  const onActivity = (): void => {
    const now = performance.now();
    if (now - last < USER_ACTIVITY_INTERVAL_MS) return;
    last = now;
    report();
  };
  USER_ACTIVITY_EVENTS.forEach((type) =>
    target.addEventListener(type, onActivity, { passive: true }),
  );
  return (): void =>
    USER_ACTIVITY_EVENTS.forEach((type) =>
      target.removeEventListener(type, onActivity),
    );
};

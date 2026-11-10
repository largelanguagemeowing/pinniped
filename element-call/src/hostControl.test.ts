/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";

import { setAudioEnabled$ } from "./controls";
import {
  applyHostCallControl,
  layoutRequest$,
  parseHostCallControl,
  reportUserActivity,
  screenShareStop$,
} from "./hostControl";

describe("parseHostCallControl", () => {
  it("keeps the fields the action defines", () => {
    expect(
      parseHostCallControl({
        layout: "spotlight",
        screenShare: false,
        outputEnabled: false,
        idle: true,
        scrollbar: { track: "rgb(1, 2, 3)", thumb: "rgb(4, 5, 6)" },
      }),
    ).toEqual({
      layout: "spotlight",
      screenShare: false,
      outputEnabled: false,
      idle: true,
      scrollbar: { track: "rgb(1, 2, 3)", thumb: "rgb(4, 5, 6)" },
    });
  });

  it("drops everything else", () => {
    expect(
      parseHostCallControl({
        layout: "pip",
        screenShare: true,
        outputEnabled: "no",
        idle: 1,
        scrollbar: { track: "red" },
        extra: 1,
      }),
    ).toEqual({});
    expect(parseHostCallControl(null)).toEqual({});
    expect(parseHostCallControl([])).toEqual({});
  });
});

describe("applyHostCallControl", () => {
  it("applies only the fields that are present", () => {
    const layouts: string[] = [];
    const outputs: boolean[] = [];
    let stops = 0;
    const subscriptions = [
      layoutRequest$.subscribe((l) => layouts.push(l)),
      setAudioEnabled$.subscribe((o) => outputs.push(o)),
      screenShareStop$.subscribe(() => (stops += 1)),
    ];
    const root = document.createElement("div");

    applyHostCallControl({ outputEnabled: false }, root);
    expect(outputs).toEqual([false]);
    expect(layouts).toEqual([]);
    expect(stops).toBe(0);
    expect(root.dataset.pinnipedIdle).toBeUndefined();

    applyHostCallControl(
      {
        layout: "grid",
        screenShare: false,
        idle: true,
        scrollbar: { track: "rgb(1, 2, 3)", thumb: "rgb(4, 5, 6)" },
      },
      root,
    );
    expect(layouts).toEqual(["grid"]);
    expect(stops).toBe(1);
    expect(outputs).toEqual([false]);
    expect(root.dataset.pinnipedIdle).toBe("true");
    expect(root.style.getPropertyValue("--pinniped-scrollbar-track")).toBe(
      "rgb(1, 2, 3)",
    );
    expect(root.style.getPropertyValue("--pinniped-scrollbar-thumb")).toBe(
      "rgb(4, 5, 6)",
    );

    subscriptions.forEach((s) => s.unsubscribe());
  });
});

describe("reportUserActivity", () => {
  afterEach(() => vi.useRealTimers());

  it("reports input at most once a second and stops when told to", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const target = document.implementation.createHTMLDocument();
    const stop = reportUserActivity(report, target);

    target.dispatchEvent(new Event("mousemove"));
    target.dispatchEvent(new Event("keydown"));
    expect(report).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    target.dispatchEvent(new Event("wheel"));
    expect(report).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(1000);
    target.dispatchEvent(new Event("mousedown"));
    expect(report).toHaveBeenCalledTimes(2);
  });
});

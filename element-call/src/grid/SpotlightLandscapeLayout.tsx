/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type ReactNode,
  use,
  useSyncExternalStore,
} from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { type CallLayout } from "./CallLayout";
import { planStrip, type StripPlan } from "./arrangeGrid";
import { type SpotlightLandscapeLayout as SpotlightLandscapeLayoutModel } from "../state/layout-types.ts";
import styles from "./SpotlightLandscapeLayout.module.css";
import { useUpdateLayout, useVisibleTiles } from "./Grid";
import { ScreenSharePreview } from "./ScreenSharePreview";
import { FocusMediaContext } from "./FocusMedia";
import { constant } from "../state/Behavior";
import { type MediaViewModel } from "../state/media/MediaViewModel";
import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { useBehavior } from "../useBehavior";

const noScreenShares = constant<ScreenShareViewModel[]>([]);

/**
 * Cinny: the screen shares previewed in the strip. Every share in the call, so a
 * stream stays clickable while a participant is focused; without the call context,
 * just the shares in the spotlight.
 */
const useStripScreenShares = (
  spotlightMedia: MediaViewModel[],
): ScreenShareViewModel[] => {
  const focus = use(FocusMediaContext);
  const all = useBehavior(focus?.screenShares$ ?? noScreenShares);
  return focus
    ? all
    : spotlightMedia.filter(
        (m): m is ScreenShareViewModel => m.type === "screen share",
      );
};

interface StripCSSProperties extends CSSProperties {
  "--strip-tile-width": string;
  "--strip-tile-height": string;
}

/** The size of every tile in the strip, shared by both layers so they agree. */
const stripStyle = (plan: StripPlan): StripCSSProperties => ({
  "--strip-tile-width": `${plan.tileWidth}px`,
  "--strip-tile-height": `${plan.tileHeight}px`,
});

// Cinny: "Hide Members" toggle for the participant strip. Shared
// between the fixed and scrolling layers, so it lives outside React state.
let stripHidden = false;
const stripListeners = new Set<() => void>();
const setStripHidden = (hidden: boolean): void => {
  stripHidden = hidden;
  stripListeners.forEach((l) => l());
};
const useStripHidden = (): boolean =>
  useSyncExternalStore(
    (l) => {
      stripListeners.add(l);
      return (): void => {
        stripListeners.delete(l);
      };
    },
    () => stripHidden,
  );

/**
 * An implementation of the "spotlight landscape" layout, in which the spotlight
 * tile takes up most of the space on the left, and the grid of participants is
 * shown as a scrolling rail on the right.
 */
export const makeSpotlightLandscapeLayout: CallLayout<
  SpotlightLandscapeLayoutModel
> = ({ minBounds$ }) => ({
  foreground: "scrolling",

  fixed: function SpotlightLandscapeLayoutFixed({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    const { width } = useObservableEagerState(minBounds$);
    const hidden = useStripHidden();
    const plan = planStrip(
      width,
      useStripScreenShares(useObservableEagerState(model.spotlight.media$))
        .length,
      model.grid.length,
    );

    return (
      <div
        ref={ref}
        className={classNames(styles.layer, { [styles.stripHidden]: hidden })}
        style={stripStyle(plan)}
      >
        <div className={styles.spotlight}>
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight}
          />
        </div>
        {/* Reserve the same space as the strip in the scrolling layer, otherwise
            the spotlight would extend underneath the participant tiles. */}
        <div className={styles.grid}>
          {Array.from({ length: plan.shares + plan.people }, (_, i) => (
            <div key={i} className={styles.spacer} />
          ))}
        </div>
      </div>
    );
  },

  scrolling: function SpotlightLandscapeLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const { width } = useObservableEagerState(minBounds$);
    const spotlightMedia = useObservableEagerState(model.spotlight.media$);
    const withIndicators = spotlightMedia.length > 1;
    const stripScreenShares = useStripScreenShares(spotlightMedia);
    const hidden = useStripHidden();
    const plan = planStrip(width, stripScreenShares.length, model.grid.length);

    return (
      <div
        ref={ref}
        className={classNames(styles.layer, { [styles.stripHidden]: hidden })}
        style={stripStyle(plan)}
      >
        <div
          className={classNames(styles.spotlight, {
            [styles.withIndicators]: withIndicators,
          })}
        />
        <div className={styles.grid}>
          {stripScreenShares.slice(0, plan.shares).map((m) => (
            <ScreenSharePreview key={m.id} vm={m} />
          ))}
          {model.grid.slice(0, plan.people).map((m) => (
            <Slot key={m.id} className={styles.slot} id={m.id} model={m} />
          ))}
        </div>
        {/* Outside the strip so it stays reachable while the strip is hidden. */}
        {model.grid.length > 0 && (
          <button
            className={styles.stripToggle}
            aria-label={hidden ? "Show Members" : "Hide Members"}
            aria-pressed={hidden}
            data-tooltip={hidden ? "Show Members" : "Hide Members"}
            onClick={() => setStripHidden(!hidden)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d={
                  hidden
                    ? "M18.7 14.7a1 1 0 0 1-1.4 0L12 9.41l-5.3 5.3a1 1 0 0 1-1.4-1.42l6-6a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.42Z"
                    : "M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42Z"
                }
              />
            </svg>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.44 17.27c.15.43.54.73 1 .73h1.06c.83 0 1.5-.67 1.5-1.5a7.5 7.5 0 0 0-6.5-7.43c-.55-.08-.99.38-1.1.92-.06.3-.15.6-.26.87-.23.58-.05 1.3.47 1.63a9.53 9.53 0 0 1 3.83 4.78ZM12.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20.5a7.5 7.5 0 0 1 15 0c0 .83-.67 1.5-1.5 1.5a.2.2 0 0 1-.2-.16c-.2-.96-.56-1.87-.88-2.54-.1-.23-.42-.15-.42.1v2.1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5Z"
              />
            </svg>
          </button>
        )}
      </div>
    );
  },
});

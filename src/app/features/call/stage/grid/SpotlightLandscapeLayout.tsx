/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type CSSProperties, type ReactNode, use, useSyncExternalStore } from 'react';
import classNames from 'classnames';
import { Icon, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import { type BehaviorSubject } from 'rxjs';

import { type SpotlightLandscapeLayout as SpotlightLandscapeLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { type MediaViewModel } from '../../../../plugins/call/engine/state/media/MediaViewModel';
import { type ScreenShareViewModel } from '../../../../plugins/call/engine/state/media/ScreenShareViewModel';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type CallLayout, useLayoutBounds } from './CallLayout';
import { planStrip, type StripPlan } from './arrangeGrid';
import { useStripPeople } from './useStripPeople';
import * as css from './SpotlightLandscapeLayout.css';
import { useUpdateLayout, useVisibleTiles } from './Grid';
import { ScreenSharePreview } from './ScreenSharePreview';
import { StageContext, useStageScreenShares$ } from '../StageContext';
import { stripVars } from './vars';
import { useRenderTrail } from '../renderTrail';

/**
 * The screen shares previewed in the strip: every share in the call, so a stream stays
 * clickable while a participant is focused; outside a stage, just the shares in the spotlight.
 */
const useStripScreenShares = (spotlightMedia: MediaViewModel[]): ScreenShareViewModel[] => {
  const stage = use(StageContext);
  const all = useBehavior(useStageScreenShares$());
  return stage
    ? all
    : spotlightMedia.filter((m): m is ScreenShareViewModel => m.type === 'screen share');
};

/** The size of every tile in the strip, shared by both layers so they agree. */
const stripStyle = (plan: StripPlan): CSSProperties =>
  ({
    [stripVars.tileWidth]: `${plan.tileWidth}px`,
    [stripVars.tileHeight]: `${plan.tileHeight}px`,
  }) as CSSProperties;

/** Whether the participant strip is hidden; shared by both layers of one layout. */
const useStripHidden = (hidden$: BehaviorSubject<boolean>): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const subscription = hidden$.subscribe(onChange);
      return () => subscription.unsubscribe();
    },
    () => hidden$.value
  );

/**
 * An implementation of the "spotlight landscape" layout, in which the spotlight
 * tile takes up most of the space, and the participants are shown in a strip below it.
 */
export const makeSpotlightLandscapeLayout: CallLayout<SpotlightLandscapeLayoutModel> = ({
  stripHidden$,
}) => {
  return {
    foreground: 'scrolling',

    fixed: function SpotlightLandscapeLayoutFixed({ ref, model, Slot }): ReactNode {
      useUpdateLayout();
      const bounds = useLayoutBounds();
      const { width } = bounds;
      const hidden = useStripHidden(stripHidden$);
      const spotlightMedia = useBehavior(model.spotlight.media$);
      const stripScreenShares = useStripScreenShares(spotlightMedia);
      const plan = planStrip(width, stripScreenShares.length, model.grid.length);
      useRenderTrail('spotlight-landscape/fixed', {
        model,
        bounds,
        hidden,
        spotlightMedia,
        stripScreenShares,
      });

      return (
        <div
          ref={ref}
          className={classNames(css.layer, { [css.stripHidden]: hidden })}
          style={stripStyle(plan)}
        >
          <div className={css.spotlight}>
            <Slot className={css.slot} id="spotlight" model={model.spotlight} />
          </div>
          {/* Reserve the same space as the strip in the scrolling layer, otherwise
              the spotlight would extend underneath the participant tiles. */}
          <div className={css.grid}>
            {Array.from({ length: plan.shares + plan.people }, (_, i) => (
              <div key={i} className={css.spacer} />
            ))}
          </div>
        </div>
      );
    },

    scrolling: function SpotlightLandscapeLayoutScrolling({ ref, model, Slot }): ReactNode {
      useUpdateLayout();
      useVisibleTiles(model.setVisibleTiles);
      const bounds = useLayoutBounds();
      const { width } = bounds;
      const spotlightMedia = useBehavior(model.spotlight.media$);
      const withIndicators = spotlightMedia.length > 1;
      const stripScreenShares = useStripScreenShares(spotlightMedia);
      const hidden = useStripHidden(stripHidden$);
      useRenderTrail('spotlight-landscape/scrolling', {
        model,
        bounds,
        hidden,
        spotlightMedia,
        stripScreenShares,
      });
      const plan = planStrip(width, stripScreenShares.length, model.grid.length);
      const people = useStripPeople(model.grid, plan.people);
      const toggleLabel = hidden ? 'Show Members' : 'Hide Members';

      return (
        <div
          ref={ref}
          className={classNames(css.layer, { [css.stripHidden]: hidden })}
          style={stripStyle(plan)}
        >
          <div className={classNames(css.spotlight, { [css.withIndicators]: withIndicators })} />
          <div className={css.grid}>
            {stripScreenShares.slice(0, plan.shares).map((m) => (
              <ScreenSharePreview key={m.id} vm={m} />
            ))}
            {people.map((m) => (
              <Slot key={m.id} className={css.slot} id={m.id} model={m} />
            ))}
          </div>
          {/* Outside the strip so it stays reachable while the strip is hidden. */}
          {model.grid.length > 0 && (
            <TooltipProvider
              position="Top"
              tooltip={
                <Tooltip>
                  <Text size="T200">{toggleLabel}</Text>
                </Tooltip>
              }
            >
              {(anchorRef) => (
                <button
                  ref={anchorRef}
                  type="button"
                  className={css.stripToggle}
                  aria-label={toggleLabel}
                  aria-pressed={hidden}
                  onClick={() => stripHidden$.next(!hidden)}
                >
                  <Icon size="200" src={hidden ? Icons.ChevronTop : Icons.ChevronBottom} />
                  <Icon size="200" src={Icons.User} filled />
                </button>
              )}
            </TooltipProvider>
          )}
        </div>
      );
    },
  };
};

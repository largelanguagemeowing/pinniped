/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type CSSProperties, type ReactNode, useCallback, useMemo } from 'react';

import { type GridLayout as GridLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import * as css from './GridLayout.css';
import { type CallLayout, useLayoutBounds } from './CallLayout';
import { arrangeGrid } from './arrangeGrid';
import { type DragCallback, useUpdateLayout, useVisibleTiles } from './Grid';
import { useStageScreenShares$ } from '../StageContext';
import { ScreenSharePreview } from './ScreenSharePreview';
import { gridVars } from './vars';
import { useRenderTrail } from '../renderTrail';

/**
 * An implementation of the "grid" layout, in which all participants are shown
 * together in a scrolling grid.
 */
export const makeGridLayout: CallLayout<GridLayoutModel> = () => ({
  foreground: 'fixed',

  // The "fixed" (non-scrolling) part of the layout is where the spotlight tile
  // lives
  fixed: function GridLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const alignment = useBehavior(model.spotlightAlignment$);
    useRenderTrail('grid/fixed', { model, alignment });

    const onDragSpotlight: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        model.spotlightAlignment$.next({
          block: yRatio < 0.5 ? 'start' : 'end',
          inline: xRatio < 0.5 ? 'start' : 'end',
        }),
      [model.spotlightAlignment$]
    );

    return (
      <div ref={ref} className={css.fixed}>
        {model.spotlight && (
          <Slot
            className={css.slot}
            id="spotlight"
            model={model.spotlight}
            onDrag={onDragSpotlight}
            data-block-alignment={alignment.block}
            data-inline-alignment={alignment.inline}
          />
        )}
      </div>
    );
  },

  // The scrolling part of the layout is where all the grid tiles live
  scrolling: function GridLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const bounds = useLayoutBounds();
    const { width, height: minHeight } = bounds;
    // Screen shares are tiles in the grid too.
    const screenShares = useBehavior(useStageScreenShares$());
    useRenderTrail('grid/scrolling', { model, bounds, screenShares });
    const tileCount = model.grid.length + screenShares.length;
    const { gap, tileWidth, tileHeight } = useMemo(
      () => arrangeGrid(width, minHeight, tileCount),
      [width, minHeight, tileCount]
    );

    return (
      <div
        ref={ref}
        className={css.scrolling}
        style={
          {
            width,
            [gridVars.gap]: `${gap}px`,
            [gridVars.tileWidth]: `${Math.floor(tileWidth)}px`,
            [gridVars.tileHeight]: `${Math.floor(tileHeight)}px`,
          } as CSSProperties
        }
      >
        {screenShares.map((m) => (
          <ScreenSharePreview key={m.id} vm={m} variant="grid" />
        ))}
        {model.grid.map((m) => (
          <Slot key={m.id} className={css.slot} id={m.id} model={m} />
        ))}
      </div>
    );
  },
});

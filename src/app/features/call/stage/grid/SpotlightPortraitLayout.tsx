/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type CSSProperties, type ReactNode } from 'react';
import classNames from 'classnames';

import { type SpotlightPortraitLayout as SpotlightPortraitLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type CallLayout } from './CallLayout';
import { arrangeBelowSpotlight } from './arrangeGrid';
import * as css from './SpotlightPortraitLayout.css';
import { useUpdateLayout, useVisibleTiles } from './Grid';
import { gridVars } from './vars';

/**
 * An implementation of the "spotlight portrait" layout, in which the spotlight
 * tile is shown across the top of the screen, and the grid of participants
 * below it.
 */
export const makeSpotlightPortraitLayout: CallLayout<SpotlightPortraitLayoutModel> = ({
  minBounds$,
}) => ({
  foreground: 'fixed',

  fixed: function SpotlightPortraitLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();

    return (
      <div ref={ref} className={css.layer}>
        <div className={css.spotlight}>
          <Slot className={css.slot} id="spotlight" model={model.spotlight} />
        </div>
      </div>
    );
  },

  scrolling: function SpotlightPortraitLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const { width, height } = useBehavior(minBounds$);
    const withIndicators = useBehavior(model.spotlight.media$).length > 1;
    // The grid gets whatever height the 16:9 spotlight leaves, so that the
    // participants fit under it instead of scrolling behind it.
    const { gap, tileWidth, tileHeight } = arrangeBelowSpotlight(
      width,
      height,
      model.grid.length,
      withIndicators
    );

    return (
      <div
        ref={ref}
        className={css.layer}
        style={
          {
            [gridVars.gap]: `${gap}px`,
            [gridVars.tileWidth]: `${Math.floor(tileWidth)}px`,
            [gridVars.tileHeight]: `${Math.floor(tileHeight)}px`,
          } as CSSProperties
        }
      >
        <div className={classNames(css.spotlight, { [css.withIndicators]: withIndicators })} />
        <div className={css.grid}>
          {model.grid.map((m) => (
            <Slot key={m.id} className={css.slot} id={m.id} model={m} />
          ))}
        </div>
      </div>
    );
  },
});

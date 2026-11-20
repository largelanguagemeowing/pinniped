/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ReactNode, useCallback, useMemo } from 'react';

import { type OneOnOneLandscapeLayout as OneOnOneLandscapeLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type CallLayout, arrangeTiles, useLayoutBounds } from './CallLayout';
import * as css from './OneOnOneLandscapeLayout.css';
import { type DragCallback, useUpdateLayout } from './Grid';

/**
 * An implementation of the "one-on-one" layout for landscape screens, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOneLandscapeLayout: CallLayout<OneOnOneLandscapeLayoutModel> = () => ({
  foreground: 'fixed',

  fixed: function OneOnOneLandscapeLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function OneOnOneLandscapeLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const { width, height } = useLayoutBounds();
    const pipAlignment = useBehavior(model.pipAlignment$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height]
    );

    const onDragLocalTile: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        model.pipAlignment$.next({
          block: yRatio < 0.5 ? 'start' : 'end',
          inline: xRatio < 0.5 ? 'start' : 'end',
        }),
      [model.pipAlignment$]
    );

    return (
      <div ref={ref} className={css.layer}>
        <Slot
          id={model.spotlight.id}
          model={model.spotlight}
          className={css.container}
          style={{ width: tileWidth, height: tileHeight }}
        >
          <Slot
            className={css.local}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragLocalTile}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        </Slot>
      </div>
    );
  },
});

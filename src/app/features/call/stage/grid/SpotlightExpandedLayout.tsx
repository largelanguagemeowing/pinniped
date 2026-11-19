/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ReactNode, useCallback } from 'react';

import { type SpotlightExpandedLayout as SpotlightExpandedLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type CallLayout } from './CallLayout';
import { type DragCallback, useUpdateLayout } from './Grid';
import * as css from './SpotlightExpandedLayout.css';

/**
 * An implementation of the "expanded spotlight" layout, in which the spotlight
 * tile stretches edge-to-edge and is overlaid by a picture-in-picture tile.
 */
export const makeSpotlightExpandedLayout: CallLayout<SpotlightExpandedLayoutModel> = () => ({
  foreground: 'scrolling',

  fixed: function SpotlightExpandedLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();

    return (
      <div ref={ref} className={css.layer}>
        <Slot className={css.spotlight} id="spotlight" model={model.spotlight} />
      </div>
    );
  },

  scrolling: function SpotlightExpandedLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const pipAlignment = useBehavior(model.pipAlignment$);

    const onDragPip: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        model.pipAlignment$.next({
          block: yRatio < 0.5 ? 'start' : 'end',
          inline: xRatio < 0.5 ? 'start' : 'end',
        }),
      [model.pipAlignment$]
    );

    return (
      <div ref={ref} className={css.layer}>
        {model.pip && (
          <Slot
            className={css.pip}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragPip}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        )}
      </div>
    );
  },
});

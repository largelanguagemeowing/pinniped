/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ReactNode, useCallback } from 'react';

import { type OneOnOnePortraitLayout as OneOnOnePortraitLayoutModel } from '../../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type CallLayout } from './CallLayout';
import * as css from './OneOnOnePortraitLayout.css';
import { type DragCallback, useUpdateLayout } from './Grid';

/**
 * An implementation of the "one-on-one" layout for portrait screens, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOnePortraitLayout: CallLayout<OneOnOnePortraitLayoutModel> = () => ({
  foreground: 'scrolling',

  fixed: function OneOnOnePortraitLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    return (
      <div ref={ref} className={css.layer}>
        <Slot className={css.spotlight} id="spotlight" model={model.spotlight} />
      </div>
    );
  },

  scrolling: function OneOnOnePortraitLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const pipSize = useBehavior(model.pipSize$);
    const pipAlignment = useBehavior(model.pipAlignment$);
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
        {model.pip && (
          <Slot
            className={css.pip}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragLocalTile}
            data-size={pipSize}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        )}
      </div>
    );
  },
});

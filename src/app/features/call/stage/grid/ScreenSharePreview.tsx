/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { use } from 'react';
import classNames from 'classnames';
import { Icon, Icons } from 'folds';

import * as css from './ScreenSharePreview.css';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { type ScreenShareViewModel } from '../../../../plugins/call/engine/state/media/ScreenShareViewModel';
import { StageContext } from '../StageContext';
import { VideoTrack } from '../tile/VideoTrack';

interface Props {
  vm: ScreenShareViewModel;
  /**
   * "strip": a small dimmed preview in the spotlight layout's participant strip.
   * "grid": a full live tile in the grid layout, sized by the grid.
   */
  variant?: 'strip' | 'grid';
}

/** A screen share among the participants; clicking it puts it in the spotlight. */
export function ScreenSharePreview({ vm, variant = 'strip' }: Props) {
  const video = useBehavior(vm.video$);
  const displayName = useBehavior(vm.displayName$);
  const stage = use(StageContext);

  return (
    <button
      type="button"
      className={classNames(css.preview, { [css.gridTile]: variant === 'grid' })}
      data-testid="screenSharePreview"
      aria-label={`Focus ${displayName}'s screen`}
      onClick={() => stage?.focusMedia(vm.id)}
    >
      {video !== undefined && <VideoTrack trackRef={video} className={css.video} />}
      <Icon className={css.icon} size="Inherit" src={Icons.ScreenShare} aria-hidden />
      <span className={css.live}>Live</span>
      <span className={css.name}>
        <Icon size="100" src={Icons.ScreenShare} aria-hidden />
        {displayName}
      </span>
    </button>
  );
}

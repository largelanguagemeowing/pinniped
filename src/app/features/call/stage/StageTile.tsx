/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { createContext, type ReactNode, use } from 'react';
import classNames from 'classnames';

import { type CallViewModel } from '../../../plugins/call/engine/state/CallViewModel/CallViewModel';
import {
  GridTileViewModel,
  type TileViewModel,
} from '../../../plugins/call/engine/state/TileViewModel';
import { useBehavior } from '../../../plugins/call/engine/useBehavior';
import { type TileProps } from './grid/Grid';
import { GridTile } from './tile/GridTile';
import { SpotlightTile } from './tile/SpotlightTile';
import { isTileBodyClick } from './StageContext';
import * as css from './CallStage.css';

interface TileContextValue {
  vm: CallViewModel;
  /** False while something covers the tiles: they are out of the tab order then. */
  focusable: boolean;
}

export const TileContext = createContext<TileContextValue | null>(null);

/** A tile of the call view, as the grid places it. */
export function StageTile({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  model,
}: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
  const context = use(TileContext);
  if (context === null) throw new Error('StageTile used outside a call stage');
  const { vm, focusable } = context;
  const spotlightExpanded = useBehavior(vm.spotlightExpanded$);
  const showSpotlightIndicators = useBehavior(vm.showSpotlightIndicators$);
  const showSpeakingIndicators = useBehavior(vm.showSpeakingIndicators$);
  const showNameTags = useBehavior(vm.showNameTags$);

  return model instanceof GridTileViewModel ? (
    <GridTile
      ref={ref}
      vm={model}
      onClick={(e) => {
        if (isTileBodyClick(e)) vm.focusMedia(model.media$.value.id);
      }}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      className={classNames(className, css.tile)}
      style={style}
      showSpeakingIndicators={showSpeakingIndicators}
      showNameTags={showNameTags}
      focusable={focusable}
    />
  ) : (
    <SpotlightTile
      ref={ref}
      vm={model}
      onClick={(e) => {
        if (isTileBodyClick(e)) vm.showGrid();
      }}
      expanded={spotlightExpanded}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      showIndicators={showSpotlightIndicators}
      showNameTags={showNameTags}
      focusable={focusable}
      className={classNames(className, css.tile)}
      style={style}
    />
  );
}

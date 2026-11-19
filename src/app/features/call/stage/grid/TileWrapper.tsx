/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ComponentType, type ReactNode, type RefObject, memo, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { type SpringValue } from '@react-spring/web';
import classNames from 'classnames';

import { type TileDragState, type TileProps } from './Grid';
import * as css from './TileWrapper.css';

interface Props<M, R extends HTMLElement> {
  id: string;
  onDrag: RefObject<(tileId: string, state: TileDragState) => void> | null;
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  model: M;
  Tile: ComponentType<TileProps<M, R>>;
  opacity: SpringValue<number>;
  scale: SpringValue<number>;
  zIndex: SpringValue<number>;
  x: SpringValue<number>;
  y: SpringValue<number>;
  width: SpringValue<number>;
  height: SpringValue<number>;
}

function TileWrapperInner<M, R extends HTMLElement>({
  id,
  onDrag,
  targetWidth,
  targetHeight,
  model,
  Tile,
  opacity,
  scale,
  zIndex,
  x,
  y,
  width,
  height,
}: Props<M, R>): ReactNode {
  const ref = useRef<R | null>(null);

  useDrag((state) => onDrag?.current(id, state), {
    target: ref,
    filterTaps: true,
    // No preventScroll: use-gesture's filterTaps + preventScroll breaks buttons inside tiles
    // on mobile (https://github.com/pmndrs/use-gesture/issues/593).
  });

  return (
    <Tile
      ref={ref}
      className={classNames(css.tile, { [css.draggable]: onDrag })}
      style={{ opacity, scale, zIndex, x, y, width, height }}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      model={model}
    />
  );
}

/**
 * A wrapper around a tile in a video grid. This component exists to decouple
 * child components from the grid.
 */
// Typed as a plain function rather than a NamedExoticComponent, the only way to keep its type
// parameters.
export const TileWrapper = memo(TileWrapperInner) as typeof TileWrapperInner;

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type Ref,
  type SetStateAction,
  createContext,
  memo,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type SpringRef, type TransitionFn, type animated, useTransition } from '@react-spring/web';
import { type Handler, useScroll } from '@use-gesture/react';
import classNames from 'classnames';
import { logger } from 'matrix-js-sdk/lib/logger';

import * as css from './Grid.css';
import { TileWrapper } from './TileWrapper';
import { useInitial } from '../hooks';
import { useElementRect, useReducedMotion } from '../measure';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile<Model> {
  id: string;
  model: Model;
  onDrag: DragCallback | undefined;
}

type PlacedTile<Model> = Tile<Model> & Rect;

interface TileSpring {
  opacity: number;
  scale: number;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TileSpringUpdate extends Partial<TileSpring> {
  from?: Partial<TileSpring>;
  reset?: boolean;
  immediate?: boolean | ((key: string) => boolean);
  delay?: (key: string) => number;
}

interface DragState {
  tileId: string;
  tileX: number;
  tileY: number;
  cursorX: number;
  cursorY: number;
}

export type TileDragState = Parameters<Handler<'drag'>>[0];

export interface SlotProps<Model> extends Omit<ComponentProps<'div'>, 'onDrag'> {
  id: string;
  model: Model;
  onDrag?: DragCallback;
  style?: CSSProperties;
  className?: string;
}

interface Offset {
  x: number;
  y: number;
}

/**
 * Gets the offset of one element relative to an ancestor.
 */
function offset(element: HTMLElement, relativeTo: Element): Offset {
  if (!(element.offsetParent instanceof HTMLElement) || element.offsetParent === relativeTo) {
    return { x: element.offsetLeft, y: element.offsetTop };
  }
  const o = offset(element.offsetParent, relativeTo);
  o.x += element.offsetLeft;
  o.y += element.offsetTop;
  return o;
}

/**
 * How much of the grid shows before scrolling: down to the bottom of the container it scrolls
 * in, measured from where the grid starts in it.
 */
function visibleHeight(grid: HTMLElement): number {
  const scroller = grid.parentElement;
  const gridRect = grid.getBoundingClientRect();
  if (scroller === null) return Math.min(gridRect.bottom, window.innerHeight) - gridRect.top;
  const top = gridRect.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return Math.min(gridRect.height, scroller.clientHeight - top);
}

export type VisibleTilesCallback = (visibleTiles: number) => void;

interface LayoutContextValue {
  setGeneration: Dispatch<SetStateAction<number | null>>;
  setVisibleTilesCallback: Dispatch<SetStateAction<VisibleTilesCallback | null>>;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

function useLayoutContext(): LayoutContextValue {
  const context = use(LayoutContext);
  if (context === null) throw new Error('useUpdateLayout called outside a Grid layout context');
  return context;
}

/**
 * Enables Grid to react to layout changes. You must call this in your Layout
 * component or else Grid will not be reactive.
 */
export function useUpdateLayout(): void {
  const { setGeneration } = useLayoutContext();
  // On every render, tell Grid that the layout may have changed
  useEffect(() => setGeneration((prev) => (prev === null ? 0 : prev + 1)));
}

/**
 * Asks Grid to call a callback whenever the number of visible tiles may have
 * changed.
 */
export function useVisibleTiles(callback: VisibleTilesCallback): void {
  const { setVisibleTilesCallback } = useLayoutContext();
  useEffect(() => setVisibleTilesCallback(() => callback), [callback, setVisibleTilesCallback]);
  useEffect(() => (): void => setVisibleTilesCallback(null), [setVisibleTilesCallback]);
}

export interface LayoutProps<LayoutModel, TileModel, R extends HTMLElement> {
  ref?: Ref<R>;
  model: LayoutModel;
  /**
   * Component creating an invisible "slot" for a tile to go in.
   */
  Slot: ComponentType<SlotProps<TileModel>>;
}

export interface TileProps<Model, R extends HTMLElement> {
  ref?: Ref<R>;
  className?: string;
  style?: ComponentProps<typeof animated.div>['style'];
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  model: Model;
}

interface Drag {
  /**
   * The X coordinate of the dragged tile in grid space.
   */
  x: number;
  /**
   * The Y coordinate of the dragged tile in grid space.
   */
  y: number;
  /**
   * The X coordinate of the dragged tile, as a scalar of the grid width.
   */
  xRatio: number;
  /**
   * The Y coordinate of the dragged tile, as a scalar of the grid height.
   */
  yRatio: number;
}

export type DragCallback = (drag: Drag) => void;

/** The tiles the layout's slots stand for, by slot id; filled in by the slots themselves. */
const SlotTilesContext = createContext<Map<string, Tile<unknown>> | null>(null);

/** An invisible box in the layout that a tile is placed over. */
function Slot<Model>({ id, model, onDrag, style, className, ...props }: SlotProps<Model>) {
  const tiles = use(SlotTilesContext);
  useEffect(() => {
    if (tiles === null) return undefined;
    tiles.set(id, { id, model, onDrag });
    return (): void => void tiles.delete(id);
  }, [tiles, id, model, onDrag]);

  return <div className={classNames(className, css.slot)} data-id={id} style={style} {...props} />;
}

interface LayoutMemoProps<LayoutModel, TileModel, R extends HTMLElement> extends LayoutProps<
  LayoutModel,
  TileModel,
  R
> {
  Layout: ComponentType<LayoutProps<LayoutModel, TileModel, R>>;
}

function LayoutRenderer<LayoutModel, TileModel, R extends HTMLElement>({
  ref,
  Layout,
  ...props
}: LayoutMemoProps<LayoutModel, TileModel, R>): ReactNode {
  return <Layout {...props} ref={ref} />;
}

// Memoized to break the update loop where a render of Grid re-renders Layout, which in turn
// re-renders Grid.
const LayoutMemo = memo(LayoutRenderer) as typeof LayoutRenderer;

interface Props<
  LayoutModel,
  TileModel,
  LayoutRef extends HTMLElement,
  TileRef extends HTMLElement,
> {
  /**
   * Data with which to populate the layout.
   */
  model: LayoutModel;
  /**
   * A component which creates an invisible layout grid of "slots" for tiles to
   * go in, and calls useUpdateLayout so that Grid follows its changes.
   */
  Layout: ComponentType<LayoutProps<LayoutModel, TileModel, LayoutRef>>;
  /**
   * The component used to render each tile in the layout.
   */
  Tile: ComponentType<TileProps<TileModel, TileRef>>;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

/**
 * A grid of animated tiles.
 */
export function Grid<
  LayoutModel,
  TileModel,
  LayoutRef extends HTMLElement,
  TileRef extends HTMLElement,
>({
  model,
  Layout,
  Tile,
  className,
  style,
  'aria-hidden': ariaHidden,
}: Props<LayoutModel, TileModel, LayoutRef, TileRef>): ReactNode {
  // Overview: This component places tiles by rendering an invisible layout grid
  // of "slots" for tiles to go in. Once rendered, it uses the DOM API to get
  // the dimensions of each slot, feeding these numbers back into react-spring
  // to let the actual tiles move freely atop the layout.

  // To tell us when the layout has changed, the layout calls useUpdateLayout,
  // which bumps the generation after every render.

  const [gridRoot, setGridRoot] = useState<HTMLElement | null>(null);
  const gridBounds = useElementRect(gridRoot);

  const [layoutRoot, setLayoutRoot] = useState<HTMLElement | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [visibleTilesCallback, setVisibleTilesCallback] = useState<VisibleTilesCallback | null>(
    null
  );
  const tiles = useInitial(() => new Map<string, Tile<TileModel>>());
  const prefersReducedMotion = useReducedMotion();

  const context: LayoutContextValue = useMemo(
    () => ({ setGeneration, setVisibleTilesCallback }),
    [setVisibleTilesCallback]
  );

  // Combine the tile definitions and slots together to create placed tiles
  const placedTiles = useMemo(() => {
    const result: PlacedTile<TileModel>[] = [];

    if (gridRoot !== null && layoutRoot !== null) {
      const slots = layoutRoot.getElementsByClassName(css.slot) as HTMLCollectionOf<HTMLElement>;
      for (const slot of slots) {
        const id = slot.getAttribute('data-id')!;
        const tile = tiles.get(id);
        if (tile !== undefined && slot.offsetWidth > 0 && slot.offsetHeight > 0)
          result.push({
            ...tile,
            ...offset(slot, gridRoot),
            width: slot.offsetWidth,
            height: slot.offsetHeight,
          });
      }
    }

    return result;
    // The rects may change due to the grid resizing or updating to a new generation, but
    // eslint can't statically verify this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRoot, layoutRoot, tiles, gridBounds, generation]);

  useEffect(() => {
    if (visibleTilesCallback === null || gridRoot === null) return;
    const height = visibleHeight(gridRoot);
    visibleTilesCallback(placedTiles.filter((tile) => tile.y + tile.height <= height).length);
  }, [placedTiles, visibleTilesCallback, gridRoot]);

  // Drag state is stored in a ref rather than component state, because we use
  // react-spring's imperative API during gestures to improve responsiveness
  const dragState = useRef<DragState | null>(null);

  const [tileTransitions, springRef] = useTransition(
    placedTiles,
    () => ({
      key: ({ id }: Tile<TileModel>): string => id,
      from: ({ x, y, width, height }: PlacedTile<TileModel>): TileSpringUpdate => ({
        opacity: 0,
        scale: 0,
        zIndex: 1,
        x,
        y,
        width,
        height,
        immediate: prefersReducedMotion,
      }),
      enter: { opacity: 1, scale: 1, immediate: prefersReducedMotion },
      update: ({ id, x, y, width, height }: PlacedTile<TileModel>): TileSpringUpdate | null =>
        id === dragState.current?.tileId
          ? null
          : {
              x,
              y,
              width,
              height,
              immediate: prefersReducedMotion,
            },
      leave: { opacity: 0, scale: 0, immediate: prefersReducedMotion },
      config: { mass: 0.7, tension: 252, friction: 25 },
    })
    // react-spring's types can't infer the spring type
  ) as unknown as [TransitionFn<PlacedTile<TileModel>, TileSpring>, SpringRef<TileSpring>];

  // Because we're using react-spring in imperative mode, we're responsible for
  // firing animations manually whenever the tiles array updates
  useEffect(() => {
    springRef.start().forEach((p) => void p.catch(logger.error));
  }, [placedTiles, springRef]);

  const animateDraggedTile = (endOfGesture: boolean, callback: DragCallback): void => {
    const { tileId, tileX, tileY } = dragState.current!;
    const tile = placedTiles.find((t) => t.id === tileId)!;

    springRef.current
      .find((c) => (c.item as Tile<TileModel>).id === tileId)
      ?.start(
        endOfGesture
          ? {
              scale: 1,
              zIndex: 1,
              x: tile.x,
              y: tile.y,
              width: tile.width,
              height: tile.height,
              immediate: prefersReducedMotion || ((key): boolean => key === 'zIndex'),
              // Allow the tile's position to settle before pushing its
              // z-index back down
              delay: (key): number => (key === 'zIndex' ? 500 : 0),
            }
          : {
              scale: 1.1,
              zIndex: 2,
              x: tileX,
              y: tileY,
              immediate:
                prefersReducedMotion ||
                ((key): boolean => key === 'zIndex' || key === 'x' || key === 'y'),
            }
      )
      .catch(logger.error);

    if (endOfGesture)
      callback({
        x: tileX,
        y: tileY,
        xRatio: tileX / (gridBounds.width - tile.width),
        yRatio: tileY / (gridBounds.height - tile.height),
      });
  };

  const scrollOffset = useRef(0);

  // Tiles bind the drag gesture themselves, by ref (spreading bind() across them would break
  // their memoization); this is the handler they call.
  const onTileDrag = (
    tileId: string,
    { tap, initial: [initialX, initialY], delta: [dx, dy], last }: TileDragState
  ): void => {
    if (tap) return;
    const tileController = springRef.current.find((c) => (c.item as Tile<TileModel>).id === tileId);
    if (tileController === undefined) return;
    const callback = tiles.get(tileController.item.id)?.onDrag;
    if (callback == null) return;

    if (dragState.current === null) {
      const tileSpring = tileController.get();
      dragState.current = {
        tileId,
        tileX: tileSpring.x,
        tileY: tileSpring.y,
        cursorX: initialX - gridBounds.x,
        cursorY: initialY - gridBounds.y + scrollOffset.current,
      };
    }

    dragState.current.tileX += dx;
    dragState.current.tileY += dy;
    dragState.current.cursorX += dx;
    dragState.current.cursorY += dy;

    animateDraggedTile(last, callback);

    if (last) dragState.current = null;
  };

  const onTileDragRef = useRef(onTileDrag);
  useLayoutEffect(() => {
    onTileDragRef.current = onTileDrag;
  });

  useScroll(
    ({ xy: [, y], delta: [, dy] }) => {
      scrollOffset.current = y;

      if (dragState.current !== null) {
        dragState.current.tileY += dy;
        dragState.current.cursorY += dy;
        const callback = tiles.get(dragState.current.tileId)?.onDrag;
        if (callback) animateDraggedTile(false, callback);
      }
    },
    { target: gridRoot ?? undefined }
  );

  return (
    <div
      ref={setGridRoot}
      className={classNames(className, css.grid)}
      style={style}
      aria-hidden={ariaHidden}
    >
      <LayoutContext value={context}>
        <SlotTilesContext value={tiles as Map<string, Tile<unknown>>}>
          <LayoutMemo<LayoutModel, TileModel, LayoutRef>
            ref={setLayoutRoot as Ref<LayoutRef>}
            Layout={Layout}
            model={model}
            Slot={Slot as ComponentType<SlotProps<TileModel>>}
          />
        </SlotTilesContext>
      </LayoutContext>
      {tileTransitions((spring, { id, model: tileModel, onDrag, width, height }) => (
        <TileWrapper
          key={id}
          id={id}
          onDrag={onDrag ? onTileDragRef : null}
          targetWidth={width}
          targetHeight={height}
          model={tileModel}
          Tile={Tile}
          {...spring}
        />
      ))}
    </div>
  );
}

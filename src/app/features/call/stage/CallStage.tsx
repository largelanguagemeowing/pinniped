/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import classNames from 'classnames';
import { type RectCords, Scroll, Spinner, Text } from 'folds';
import { BehaviorSubject } from 'rxjs';
import { useAtomValue, useSetAtom } from 'jotai';

import { type Call } from '../../../plugins/call/Call';
import { callFullscreenAtom, callStageMountsAtom } from '../../../state/call';
import { type Layout } from '../../../plugins/call/engine/state/layout-types';
import { useBehavior } from '../../../plugins/call/engine/useBehavior';
import { Grid } from './grid/Grid';
import { type CallLayoutOutputs, LayoutBoundsProvider } from './grid/CallLayout';
import { makeGridLayout } from './grid/GridLayout';
import { makeOneOnOneLandscapeLayout } from './grid/OneOnOneLandscapeLayout';
import { makeOneOnOnePortraitLayout } from './grid/OneOnOnePortraitLayout';
import { makeSpotlightExpandedLayout } from './grid/SpotlightExpandedLayout';
import { makeSpotlightLandscapeLayout } from './grid/SpotlightLandscapeLayout';
import { makeSpotlightPortraitLayout } from './grid/SpotlightPortraitLayout';
import { ReactionsOverlay } from './reactions/ReactionsOverlay';
import { SpotlightTile } from './tile/SpotlightTile';
import { type Stage, StageContext } from './StageContext';
import { StageTile, TileContext } from './StageTile';
import { useLatest } from './hooks';
import { useScrollerSize } from './measure';
import { recordStage, useRenderTrail } from './renderTrail';
import { useStageShortcuts } from './useStageShortcuts';
import * as css from './CallStage.css';

export type CallStageProps = {
  call: Call;
  /** The user has been idle for a few seconds: names and other labels fade out. */
  idle: boolean;
  /** Open Pinniped's participant menu for this Matrix user at this anchor (right-click / menu button on a tile). */
  onMemberMenu: (userId: string, anchor: RectCords) => void;
  /** Height in pixels of the screen share being watched in the spotlight, or null when there is none. */
  onStreamHeightChange: (height: number | null) => void;
};

/** Each call's strip toggle, kept while the call runs though its view comes and goes. */
const stripHiddenByCall = new WeakMap<Call, BehaviorSubject<boolean>>();
const stripHiddenOf = (call: Call): BehaviorSubject<boolean> => {
  let stripHidden$ = stripHiddenByCall.get(call);
  if (stripHidden$ === undefined) {
    stripHidden$ = new BehaviorSubject(false);
    stripHiddenByCall.set(call, stripHidden$);
  }
  return stripHidden$;
};

function ReconnectingIndicator(): ReactNode {
  return (
    <div className={css.reconnecting}>
      <div className={css.reconnectingToast} role="status">
        <Spinner size="200" variant="Secondary" />
        <Text size="T300">Reconnecting…</Text>
      </div>
    </div>
  );
}

/** The video/grid view of a running call. */
export function CallStage({ call, idle, onMemberMenu, onStreamHeightChange }: CallStageProps) {
  const { vm } = call;
  const layout = useBehavior(vm.layout$);
  const edgeToEdge = useBehavior(vm.edgeToEdge$);
  const showNameTags = useBehavior(vm.showNameTags$);
  const reconnecting = useBehavior(vm.reconnecting$);
  // While reconnecting, the tiles are covered: out of the tab order and the accessibility tree.
  const contentObscured = reconnecting;

  // The call is in view while this stage is mounted, so the floating picture-in-picture hides.
  const setStageMounts = useSetAtom(callStageMountsAtom);
  const fullscreen = useAtomValue(callFullscreenAtom);
  useEffect(() => {
    setStageMounts((n) => n + 1);
    return () => setStageMounts((n) => n - 1);
  }, [setStageMounts]);

  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const gridBounds = useScrollerSize(scroller);
  // The call chooses between its narrow and normal layouts by the stage's shape. Not from a layout
  // effect: an update there re-renders within the same commit, once more for every resize.
  useEffect(() => {
    if (gridBounds.width <= 0 || gridBounds.height <= 0) return;
    recordStage('setViewSize', `${gridBounds.width}x${gridBounds.height}`);
    call.setViewSize(gridBounds.width, gridBounds.height);
  }, [call, gridBounds]);
  useRenderTrail('CallStage', {
    layout,
    edgeToEdge,
    showNameTags,
    reconnecting,
    gridBounds,
    scroller,
    idle,
  });

  const stripHidden$ = stripHiddenOf(call);
  const layouts = useMemo(() => {
    const inputs = { stripHidden$ };
    return {
      grid: makeGridLayout(inputs),
      'spotlight-landscape': makeSpotlightLandscapeLayout(inputs),
      'spotlight-portrait': makeSpotlightPortraitLayout(inputs),
      'spotlight-expanded': makeSpotlightExpandedLayout(inputs),
      'one-on-one-landscape': makeOneOnOneLandscapeLayout(inputs),
      'one-on-one-portrait': makeOneOnOnePortraitLayout(inputs),
    };
  }, [stripHidden$]);

  const latestOnMemberMenu = useLatest(onMemberMenu);
  const latestOnStreamHeightChange = useLatest(onStreamHeightChange);
  const stage: Stage = useMemo(() => {
    // The video reports its size on several events; pass on changes only.
    let streamHeight: number | null = null;
    return {
      focusMedia: vm.focusMedia,
      showGrid: vm.showGrid,
      screenShares$: vm.screenShares$,
      undecryptable$: call.undecryptable$,
      openMemberMenu: (userId, anchor) => latestOnMemberMenu.current(userId, anchor),
      reportStreamHeight: (height) => {
        if (height === streamHeight) return;
        streamHeight = height;
        latestOnStreamHeightChange.current(height);
      },
    };
  }, [call, vm, latestOnMemberMenu, latestOnStreamHeightChange]);
  const tileContext = useMemo(() => ({ vm, focusable: !contentObscured }), [vm, contentObscured]);

  // Taps on touch screens arrive as pointerup: iOS Safari doesn't reliably fire click on plain
  // divs, and scrolls end in pointercancel instead, so this only sees taps.
  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'touch' && (e.target as Element).closest?.('button, input') === null)
        vm.tapScreen();
    },
    [vm]
  );
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'mouse') vm.hoverScreen();
    },
    [vm]
  );
  const onPointerOut = useCallback(() => vm.unhoverScreen(), [vm]);
  const shortcuts = useStageShortcuts(call);

  const renderContent = (): ReactNode => {
    if (layout.type === 'pip') {
      return (
        <SpotlightTile
          className={classNames(css.tile, css.maximised)}
          vm={layout.spotlight}
          expanded
          targetWidth={gridBounds.width}
          targetHeight={gridBounds.height}
          showIndicators={false}
          showNameTags={showNameTags}
          focusable={!contentObscured}
          aria-hidden={contentObscured}
        />
      );
    }

    const layers = layouts[layout.type] as CallLayoutOutputs<Layout>;
    const fixedGrid = (
      <Grid
        key="fixed"
        name={`${layout.type}/fixed`}
        className={css.fixedGrid}
        style={{
          insetBlockStart: 0,
          width: gridBounds.width,
          height: edgeToEdge ? '100%' : gridBounds.height,
        }}
        model={layout}
        Layout={layers.fixed}
        Tile={StageTile}
        aria-hidden={contentObscured}
      />
    );
    const scrollingGrid = (
      <Grid
        key="scrolling"
        name={`${layout.type}/scrolling`}
        className={css.scrollingGrid}
        model={layout}
        Layout={layers.scrolling}
        Tile={StageTile}
        aria-hidden={contentObscured}
      />
    );

    // Put the right layer in the foreground for the requested layout
    return layers.foreground === 'fixed' ? (
      <>
        {scrollingGrid}
        {fixedGrid}
      </>
    ) : (
      <>
        {fixedGrid}
        {scrollingGrid}
      </>
    );
  };

  return (
    <StageContext value={stage}>
      <LayoutBoundsProvider value={gridBounds}>
        <TileContext value={tileContext}>
          {/* The pointer handlers only notice activity, and the shortcuts only apply while focus
            is inside the call view; each has a control of its own in the call bar. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className={css.stage}
            data-call-stage
            data-idle={idle}
            data-fullscreen={fullscreen}
            tabIndex={-1}
            onPointerUp={onPointerUp}
            onPointerMove={onPointerMove}
            onPointerOut={onPointerOut}
            onKeyDown={shortcuts.onKeyDown}
            onKeyUp={shortcuts.onKeyUp}
            onBlur={shortcuts.onBlur}
          >
            <Scroll
              ref={setScroller}
              className={css.scroller}
              variant="Background"
              direction="Vertical"
              size="300"
              visibility="Hover"
            >
              {renderContent()}
            </Scroll>
            <ReactionsOverlay vm={vm} />
            {reconnecting && <ReconnectingIndicator />}
          </div>
        </TileContext>
      </LayoutBoundsProvider>
    </StageContext>
  );
}

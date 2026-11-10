/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// A harness that mounts the real Grid and layout components, with InCallView's
// real container CSS and measuring logic, around fake tiles. It is driven by
// layout-harness/run.mjs, which resizes a real Chromium window.

import { Profiler, StrictMode, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BehaviorSubject, map } from "rxjs";
import { useObservable } from "observable-hooks";
import useMeasure from "react-use-measure";
import { animated } from "@react-spring/web";
import classNames from "classnames";

import styles from "../src/room/InCallView.module.css";
import { Grid, type TileProps } from "../src/grid/Grid";
import { type CallLayoutOutputs } from "../src/grid/CallLayout";
import { makeGridLayout } from "../src/grid/GridLayout";
import { makeSpotlightPortraitLayout } from "../src/grid/SpotlightPortraitLayout";
import { makeSpotlightLandscapeLayout } from "../src/grid/SpotlightLandscapeLayout";
import { makeOneOnOneLandscapeLayout } from "../src/grid/OneOnOneLandscapeLayout";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
  type TileViewModel,
} from "../src/state/TileViewModel";
import { constant } from "../src/state/Behavior";
import { type Layout } from "../src/state/layout-types";

const params = new URLSearchParams(location.search);
const layoutType = params.get("layout") ?? "grid";
const tileCount = Number(params.get("tiles") ?? 4);
const indicators = params.get("indicators") === "1";

const grid = Array.from(
  { length: tileCount },
  () => new GridTileViewModel(constant({} as never)),
);
const spotlight = new SpotlightTileViewModel(
  constant(Array.from({ length: indicators ? 2 : 1 }, () => ({}) as never)),
  constant(false),
);
const alignment$ = new BehaviorSubject({
  block: "end" as const,
  inline: "end" as const,
});

const models = {
  grid: {
    type: "grid",
    spotlight: params.get("spotlight") === "0" ? undefined : spotlight,
    grid,
    spotlightAlignment$: alignment$,
    setVisibleTiles: () => {},
  },
  "spotlight-portrait": {
    type: "spotlight-portrait",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  },
  "spotlight-landscape": {
    type: "spotlight-landscape",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  },
  "one-on-one-landscape": {
    type: "one-on-one-landscape",
    spotlight: grid[0],
    pip: grid[1] ?? grid[0],
    pipAlignment$: alignment$,
  },
} as unknown as Record<string, Layout>;

function Tile({
  ref,
  className,
  style,
  model,
}: TileProps<TileViewModel, HTMLDivElement>): ReactNode {
  return (
    <animated.div
      ref={ref}
      className={classNames(className, styles.tile, "tile-box")}
      style={style}
      data-tile=""
      data-kind={model instanceof SpotlightTileViewModel ? "spotlight" : "grid"}
    />
  );
}

function App(): ReactNode {
  const [containerRef, bounds] = useMeasure();
  // Same maths as InCallView: tiles are sized to the width left of the scrollbar.
  const container = useMemo(() => ({ el: null as HTMLDivElement | null }), []);
  const scrollbarWidth = container.el
    ? container.el.offsetWidth - container.el.clientWidth
    : 0;
  const gridBounds = useMemo(
    () => ({ width: bounds.width - scrollbarWidth, height: bounds.height }),
    [bounds.width, scrollbarWidth, bounds.height],
  );
  const gridBoundsObservable$ = useObservable(
    (inputs$) => inputs$.pipe(map(([b]) => b)),
    [gridBounds],
  );
  const layouts = useMemo(() => {
    const inputs = { minBounds$: gridBoundsObservable$ };
    return {
      grid: makeGridLayout(inputs),
      "spotlight-portrait": makeSpotlightPortraitLayout(inputs),
      "spotlight-landscape": makeSpotlightLandscapeLayout(inputs),
      "one-on-one-landscape": makeOneOnOneLandscapeLayout(inputs),
    } as unknown as Record<string, CallLayoutOutputs<Layout>>;
  }, [gridBoundsObservable$]);

  const model = models[layoutType];
  const layers = layouts[layoutType];
  const fixedGrid = (
    <Grid
      key="fixed"
      className={styles.fixedGrid}
      style={{ insetBlockStart: 0, height: gridBounds.height }}
      model={model}
      Layout={layers.fixed}
      Tile={Tile}
    />
  );
  const scrollingGrid = (
    <Grid
      key="scrolling"
      className={styles.scrollingGrid}
      model={model}
      Layout={layers.scrolling}
      Tile={Tile}
    />
  );
  return (
    <div
      ref={(el) => {
        container.el = el;
        containerRef(el);
      }}
      className={styles.inRoom}
      style={
        params.get("gutter") === "1" ? { scrollbarGutter: "stable" } : undefined
      }
      data-container=""
    >
      {layers.foreground === "fixed" ? (
        <>
          {scrollingGrid}
          {fixedGrid}
        </>
      ) : (
        <>
          {fixedGrid}
          {scrollingGrid}
        </>
      )}
    </div>
  );
}

// Render counts for layout-harness/profile.mjs
const prof = ((
  window as unknown as { __prof: { commits: number; actual: number } }
).__prof = { commits: 0, actual: 0 });
const onRender = (_id: string, _phase: string, actual: number): void => {
  prof.commits++;
  prof.actual += actual;
};

createRoot(document.getElementById("root")!).render(
  <Profiler id="app" onRender={onRender}>
    {params.get("strict") === "1" ? (
      <StrictMode>
        <App />
      </StrictMode>
    ) : (
      <App />
    )}
  </Profiler>,
);

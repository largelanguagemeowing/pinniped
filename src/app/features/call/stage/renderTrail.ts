import { useLayoutEffect, useRef } from 'react';
import { logger as rootLogger } from 'matrix-js-sdk/lib/logger';

/**
 * Debug trail of what the call view renders and measures, to find update loops. Always on: it
 * keeps the last events in memory and logs them when renders storm or React catches an error.
 */
const log = rootLogger.getChild('[CallStageTrail]');

type TrailEntry = { time: number; source: string; detail: string };

const TRAIL_SIZE = 400;
/** More events than this within STORM_WINDOW_MS is a storm. */
const STORM_EVENTS = 400;
const STORM_WINDOW_MS = 1000;
/** A storm is logged at most once in this long. */
const STORM_LOG_INTERVAL_MS = 5000;

const trail: TrailEntry[] = [];
let lastStormLog = -Infinity;

export function dumpStageTrail(reason: string): void {
  if (trail.length === 0) return;
  const end = trail[trail.length - 1].time;
  const counts = new Map<string, number>();
  trail
    .filter((e) => e.time > end - STORM_WINDOW_MS)
    .forEach((e) => counts.set(e.source, (counts.get(e.source) ?? 0) + 1));
  const busiest = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${n}× ${source}`)
    .join('\n');
  const lines = trail
    .map((e) => `${(e.time - end).toFixed(1).padStart(8)}ms ${e.source} ${e.detail}`)
    .join('\n');
  const age = Math.round(performance.now() - end);
  log.warn(
    `${reason} (last event ${age} ms ago)\n--- last ${STORM_WINDOW_MS} ms by source ---\n${busiest}\n--- trail ---\n${lines}`
  );
}

// For the console: `pinnipedCallStageTrail()` logs the trail on demand.
(globalThis as { pinnipedCallStageTrail?: () => void }).pinnipedCallStageTrail = () =>
  dumpStageTrail('manual dump');

export function recordStage(source: string, detail = ''): void {
  const time = performance.now();
  trail.push({ time, source, detail });
  if (trail.length > TRAIL_SIZE) trail.shift();
  const windowStart = trail.length - STORM_EVENTS;
  if (
    windowStart > 0 &&
    time - trail[windowStart].time < STORM_WINDOW_MS &&
    time - lastStormLog > STORM_LOG_INTERVAL_MS
  ) {
    lastStormLog = time;
    dumpStageTrail(`render storm: ${STORM_EVENTS} events within ${STORM_WINDOW_MS} ms`);
  }
}

const describe = (value: unknown): string => {
  if (typeof value === 'function') return 'ƒ';
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if ('type' in value) return `{type:${String(value.type)}}`;
  if ('width' in value && 'height' in value) return `${value.width}x${value.height}`;
  return '{…}';
};

/**
 * Records every commit of a component, with which of `values` changed since its last one; none
 * changed means its own state, a context or its parent re-rendered it.
 */
export function useRenderTrail(source: string, values: Record<string, unknown>): void {
  const previous = useRef<Record<string, unknown> | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = values;
    const changed =
      before === null
        ? ['mount']
        : Object.keys(values)
            .filter((key) => !Object.is(values[key], before[key]))
            .map((key) => `${key}=${describe(values[key])}`);
    recordStage(`render ${source}`, changed.length > 0 ? changed.join(' ') : '(state/context)');
  });
}

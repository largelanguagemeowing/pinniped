import React, { useMemo } from 'react';
import { Box, color, Text, toRem } from 'folds';
import { STATS_WINDOW_MS } from '../../../plugins/call/Call';
import { formatAxis, StatPoint } from '../../../plugins/call/stats';

const WIDTH = 400;
const HEIGHT = 110;
const PAD_RIGHT = 34;
const PAD_BOTTOM = 18;

/** Smallest 1/2/2.5/5 x 10^n that is >= v. */
const niceCeil = (v: number): number => {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const m = v / exp;
  const step = [1, 2, 2.5, 5, 10].find((s) => m <= s) ?? 10;
  return step * exp;
};

const formatTime = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

type StatChartProps = {
  points: StatPoint[];
  /** Window end; defaults to the newest point. */
  now?: number;
  /** Fixed y-axis maximum; otherwise it follows the data. */
  max?: number;
  /** Draw the axes and labels; the popout shows a bare line. */
  bare?: boolean;
  height?: number;
};

export function StatChart({ points, now, max, bare, height = HEIGHT }: StatChartProps) {
  const end = now ?? points[points.length - 1]?.time ?? Date.now();
  const start = end - STATS_WINDOW_MS;
  const padRight = bare ? 0 : PAD_RIGHT;
  const padBottom = bare ? 0 : PAD_BOTTOM;
  const plotW = WIDTH - padRight;
  const plotH = height - padBottom;

  const { yMax, path, ticks } = useMemo(() => {
    const visible = points.filter((p) => p.time >= start);
    const yMaxValue = max ?? niceCeil(Math.max(0, ...visible.map((p) => p.value)));
    const x = (t: number) => ((t - start) / STATS_WINDOW_MS) * plotW;
    const y = (v: number) => plotH - (v / yMaxValue) * plotH;
    const d = visible
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');
    const minuteTicks: number[] = [];
    for (let t = Math.ceil(start / 60000) * 60000; t <= end; t += 60000) minuteTicks.push(t);
    return {
      yMax: yMaxValue,
      path: d,
      ticks: minuteTicks.map((t) => ({ t, x: x(t) })),
    };
  }, [points, start, end, max, plotW, plotH]);

  const label = { fill: color.SurfaceVariant.OnContainer, fontSize: 10, opacity: 0.7 };
  const grid = color.SurfaceVariant.ContainerLine;

  return (
    <Box style={{ width: '100%', minWidth: 0 }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        style={{ display: 'block', maxHeight: toRem(height * 1.4) }}
        role="img"
      >
        {!bare &&
          ticks.map((t) => (
            <g key={t.t}>
              <line x1={t.x} x2={t.x} y1={0} y2={plotH} stroke={grid} strokeWidth={1} />
              <text x={t.x} y={height - 4} textAnchor="middle" style={label}>
                {formatTime(t.t)}
              </text>
            </g>
          ))}
        {!bare &&
          [0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={0}
                x2={plotW}
                y1={plotH - f * plotH}
                y2={plotH - f * plotH}
                stroke={grid}
                strokeWidth={1}
              />
              <text
                x={WIDTH - 2}
                y={Math.min(plotH - 2, Math.max(10, plotH - f * plotH + 3))}
                textAnchor="end"
                style={label}
              >
                {formatAxis(yMax * f)}
              </text>
            </g>
          ))}
        <path
          d={path}
          fill="none"
          stroke={color.Primary.Main}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
}

type StatChartTileProps = {
  title: string;
  value?: string;
} & StatChartProps;

/** Title with the latest value on the right, above the chart. */
export function StatChartTile({ title, value, ...chart }: StatChartTileProps) {
  return (
    <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
      <Box justifyContent="SpaceBetween" gap="200">
        <Text size="H6">{title}</Text>
        <Text size="T300" priority="300">
          {value}
        </Text>
      </Box>
      <StatChart {...chart} />
    </Box>
  );
}

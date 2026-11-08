/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Every knob of the voice activity gate and the speaking indicator. The
 * embedding client owns them and sends the whole object (URL param
 * `voiceTuning`, JSON, and the `voiceTuning` field of `io.cinny.call_settings`);
 * these defaults only matter when the widget runs without a client. Cinny has
 * its own copy of the defaults and ranges next to its settings UI.
 */
export interface VoiceTuning {
  /** dB below its open level the gate may fall before it starts closing. */
  hysteresisDb: number;
  /** ms the gate stays open after the last loud moment. */
  holdMs: number;
  /** ms time constant of the fade when the gate opens. */
  fadeInMs: number;
  /** ms time constant of the fade when the gate closes. */
  fadeOutMs: number;
  /** ms of delay added so the gate is open before the first syllable arrives. */
  lookaheadMs: number;
  /** In automatic mode, dB above the noise floor that opens the gate. */
  autoMarginDb: number;
  /** ms the speaking indicator stays on after the last loud moment. */
  indicatorHoldMs: number;
}

export const defaultVoiceTuning: VoiceTuning = {
  hysteresisDb: 6,
  holdMs: 300,
  fadeInMs: 4,
  fadeOutMs: 50,
  lookaheadMs: 20,
  autoMarginDb: 12,
  indicatorHoldMs: 250,
};

const ranges: Record<keyof VoiceTuning, [min: number, max: number]> = {
  hysteresisDb: [0, 12],
  holdMs: [0, 1000],
  fadeInMs: [1, 50],
  fadeOutMs: [5, 300],
  lookaheadMs: [0, 50],
  autoMarginDb: [6, 24],
  indicatorHoldMs: [0, 1000],
};

/** Fills in missing values with the defaults and clamps everything to its range. */
export function normalizeVoiceTuning(value: unknown): VoiceTuning {
  const given = (
    typeof value === "object" && value !== null ? value : {}
  ) as Record<string, unknown>;
  const result = { ...defaultVoiceTuning };
  for (const key of Object.keys(ranges) as (keyof VoiceTuning)[]) {
    const n = given[key];
    if (typeof n === "number" && Number.isFinite(n)) {
      const [min, max] = ranges[key];
      result[key] = Math.min(max, Math.max(min, n));
    }
  }
  return result;
}

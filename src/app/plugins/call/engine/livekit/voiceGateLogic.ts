/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Pure gate decisions, shared by the voice gate's worklet and the speaking indicator; no imports,
// since the worklet bundle must stay free of the app.

/** Level (RMS, 0..1) above which someone starts being heard as speaking. */
export const VOICE_OPEN_LEVEL = 0.008;
/** Level below which the voice counts as quiet again; under OPEN so a steady voice does not flutter. */
export const VOICE_CLOSE_LEVEL = 0.005;
/** How long to keep showing speech after the last loud moment, bridging gaps between words. */
export const VOICE_HOLD_MS = 250;

/**
 * Decides from a stream of audio levels whether someone is speaking: opens
 * immediately on a loud sample, then stays open until the level has been below
 * the close threshold for the hold time.
 */
export interface Gate {
  update(level: number, now: number): boolean;
}

export class VoiceGate implements Gate {
  private open = false;
  private lastLoudAt = -Infinity;

  public constructor(
    private openLevel = VOICE_OPEN_LEVEL,
    private closeLevel = VOICE_CLOSE_LEVEL,
    public holdMs = VOICE_HOLD_MS
  ) {}

  public setLevels(openLevel: number, closeLevel: number): void {
    this.openLevel = openLevel;
    this.closeLevel = closeLevel;
  }

  /** Feed one level measured at `now` (ms); returns whether speech is on. */
  public update(level: number, now: number): boolean {
    if (level >= (this.open ? this.closeLevel : this.openLevel)) this.lastLoudAt = now;
    this.open = now - this.lastLoudAt <= this.holdMs;
    return this.open;
  }
}

const toDb = (level: number): number => (level > 0 ? 20 * Math.log10(level) : -100);

/** The floor never starts above this, so speaking from the first moment still opens the gate. */
const FLOOR_START_DB = -50;
/** How fast the floor creeps up toward sustained sound, dB per second. */
const FLOOR_RISE_DB_PER_S = 2;
const AUTO_MIN_OPEN_DB = -60;
/** Time constant of the smoothed level the floor and the close decision use; instant levels jitter several dB. */
const SMOOTH_TAU_S = 0.15;

/**
 * A gate with no fixed threshold: it follows the lower envelope of the signal
 * as the room's noise floor (falling at once to any quieter sound, rising only
 * slowly) and opens when something is well above it. Speech has pauses, which
 * pull the floor back down; a steady noise that turns on (a fan) is learned as
 * the new floor within seconds and stops opening the gate.
 */
export class AdaptiveVoiceGate implements Gate {
  private floorDb: number | undefined;
  private smoothDb: number | undefined;
  private lastNow: number | undefined;
  private open = false;
  private lastLoudAt = -Infinity;

  /**
   * All three can be changed while the gate runs.
   * @param holdMs - how long it stays open after the last loud moment
   * @param marginDb - how far above the noise floor speech must be to open it
   * @param hysteresisDb - how far below that open point it may fall before closing
   */
  public constructor(
    public holdMs = VOICE_HOLD_MS,
    public marginDb = 12,
    public hysteresisDb = 6
  ) {}

  public update(level: number, now: number): boolean {
    const db = toDb(level);
    const dt = this.lastNow === undefined ? 0 : (now - this.lastNow) / 1000;
    this.lastNow = now;
    // The raw RMS of a short window jitters by several dB even for steady
    // noise. Tracking its dips would park the floor below the noise and let that
    // jitter cross the close threshold, holding the gate open for ever.
    this.smoothDb ??= db;
    this.smoothDb += (db - this.smoothDb) * (1 - Math.exp(-dt / SMOOTH_TAU_S));
    const smooth = this.smoothDb;
    this.floorDb ??= Math.min(smooth, FLOOR_START_DB);
    this.floorDb =
      smooth < this.floorDb
        ? this.floorDb + (smooth - this.floorDb) * 0.2
        : Math.min(smooth, this.floorDb + FLOOR_RISE_DB_PER_S * dt);
    const openDb = Math.max(this.floorDb + this.marginDb, AUTO_MIN_OPEN_DB);
    // Opening reacts to the instant level; staying open needs the smoothed one.
    const loud = this.open ? smooth >= openDb - this.hysteresisDb : db >= openDb;
    if (loud) this.lastLoudAt = now;
    this.open = now - this.lastLoudAt <= this.holdMs;
    return this.open;
  }
}

/**
 * The gate's open/close levels for the setting's 0-1 threshold, which spans
 * -70 dBFS (any sound opens it) to -20 dBFS (only loud speech does); the close
 * level is `hysteresisDb` below the open level.
 */
export function voiceGateLevels(
  threshold: number,
  hysteresisDb = 6
): {
  open: number;
  close: number;
} {
  const t = Math.min(1, Math.max(0, threshold));
  const open = 10 ** ((-70 + 50 * t) / 20);
  return { open, close: open * 10 ** (-hysteresisDb / 20) };
}

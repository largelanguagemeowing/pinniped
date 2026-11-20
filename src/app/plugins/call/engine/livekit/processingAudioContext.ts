/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** `AudioContextOptions.sinkId`, which TypeScript's DOM types do not have yet. */
type SinkOptions = AudioContextOptions & { sinkId: { type: 'none' } };

/**
 * An audio context for graphs that only process audio (meters, tracks to publish). It opens no
 * output stream: nothing it renders is heard, and the system's device changes leave it alone.
 * Browsers without audio context sinks ignore the option and give a regular context.
 */
export function processingAudioContext(options: AudioContextOptions = {}): AudioContext {
  const silent: SinkOptions = { ...options, sinkId: { type: 'none' } };
  return new AudioContext(silent);
}

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** `AudioContextOptions.sinkId`, which TypeScript's DOM types do not have yet. */
type SinkOptions = AudioContextOptions & { sinkId: { type: 'none' } };

/**
 * An audio context for graphs that only measure audio (level meters, voice activity). It opens
 * no output stream: nothing it renders is heard, and the system's device changes leave it alone.
 * Browsers without audio context sinks ignore the option and give a regular context.
 *
 * Never for audio that is sent or heard. Without a device, Chromium renders such a context from
 * a timer, 10 ms at a time, and skips a step whenever the timer fires late. Where Windows runs
 * its timer at the default 64 ticks a second, the context renders 0.64 s of audio a second: a
 * microphone feeding it overflows and is cut up in 10 ms pieces, and what the graph sends plays
 * choppy at the other end. A meter only loses samples it did not need. Use
 * {@link sendingAudioContext} for the rest.
 */
export function processingAudioContext(options: AudioContextOptions = {}): AudioContext {
  const silent: SinkOptions = { ...options, sinkId: { type: 'none' } };
  return new AudioContext(silent);
}

/**
 * An audio context for graphs whose output is sent to the call (the processed microphone, the
 * soundboard, shared-screen audio). The system's default output device clocks it, so it renders
 * as much audio as time passes; it plays nothing, since nothing is connected to its destination.
 * It holds an output stream for as long as it is open, so make it when the feature is used and
 * close it afterwards.
 */
export function sendingAudioContext(options: AudioContextOptions = {}): AudioContext {
  return new AudioContext(options);
}

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { logger } from 'matrix-js-sdk/lib/logger';

import { type CallPlayback, callPlaybackAtom } from '../../../../state/call';

const log = logger.getChild('[CallAudio]');

/**
 * Voices play through an audio context where it can follow the chosen output device, so a
 * participant's level can go past 100% (an element's volume stops at 1). Elsewhere (Firefox,
 * Safari) they play through their audio elements alone, which `TrackAudio` routes to the device.
 */
export const contextFollowsOutput =
  typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

/** Output selection on audio contexts (Chromium), which TypeScript's DOM types do not have yet. */
type SinkContext = AudioContext & {
  sinkId?: string | object;
  setSinkId?(id: string): Promise<void>;
  /** How the output fared (current Chromium, Electron 45 included). */
  playbackStats?: {
    underrunEvents: number;
    underrunDuration: number; // s
    totalDuration: number; // s
  };
  /** Its origin-trial predecessor, which current Chromium no longer has. */
  playoutStats?: {
    fallbackFramesEvents: number;
    fallbackFramesDuration: number; // ms
    totalFramesDuration: number; // ms
  };
};

/** How often `ctx` ran out of audio for its device, from whichever counter the browser has. */
function underrunsOf(ctx: SinkContext): ReturnType<CallPlayback['underruns']> {
  const stats = ctx.playbackStats;
  if (stats !== undefined) {
    return {
      events: stats.underrunEvents,
      seconds: stats.underrunDuration,
      ofSeconds: stats.totalDuration,
    };
  }
  const old = ctx.playoutStats;
  return old === undefined
    ? undefined
    : {
        events: old.fallbackFramesEvents,
        seconds: old.fallbackFramesDuration / 1000,
        ofSeconds: old.totalFramesDuration / 1000,
      };
}

/**
 * The audio context the call plays through, on the output device `outputId` ('' is the system
 * default). The larger `playback` buffer keeps a loaded machine from starving the output (heard
 * as crackling; the call report counts the underruns); the voices already wait in WebRTC's
 * jitter buffer, so the extra tens of milliseconds are not noticed.
 *
 * When its output fails (an error from the audio device, or the device missing from a new device
 * list), Chromium fires `error` on the context, and a new one replaces it. Device changes that
 * leave its output working need nothing.
 */
export function useCallAudioContext(outputId: string): AudioContext | undefined {
  const [generation, setGeneration] = useState(0);
  const [ctx, setCtx] = useState<AudioContext>();
  const setPlayback = useSetAtom(callPlaybackAtom);

  useEffect(() => {
    const created: SinkContext = new AudioContext({ latencyHint: 'playback' });
    const report = (): void =>
      setPlayback((p) => ({
        state: created.state,
        sinkId: typeof created.sinkId === 'string' ? created.sinkId : '',
        failures: p?.failures ?? [],
        sampleRate: created.sampleRate,
        baseLatency: created.baseLatency,
        outputLatency: created.outputLatency,
        underruns: () => underrunsOf(created),
      }));
    const onState = (): void => {
      log.info(`audio context ${created.state}`);
      report();
    };
    const onError = (): void => {
      log.warn("the call's audio output failed; replacing its audio context");
      setPlayback((p) => p && { ...p, failures: [...p.failures, Date.now()] });
      setGeneration((g) => g + 1);
    };
    created.addEventListener('statechange', onState);
    created.addEventListener('sinkchange', report);
    created.addEventListener('error', onError);
    report();
    setCtx(created);
    return () => {
      created.removeEventListener('statechange', onState);
      created.removeEventListener('sinkchange', report);
      created.removeEventListener('error', onError);
      created.close().catch(() => undefined);
    };
  }, [generation, setPlayback]);

  useEffect(() => () => setPlayback(undefined), [setPlayback]);

  // Output changes go one at a time, each to the latest wanted output. Chromium can leave a
  // context that is still starting with a stopped clock (state `running`, no sound) when a second
  // `setSinkId` overlaps the first; the device list is unknown at first, so the output is `''`
  // and then the real default within moments.
  const wanted = useRef(outputId);
  wanted.current = outputId;
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const target = ctx as SinkContext | undefined;
    if (target?.setSinkId === undefined) return;
    queue.current = queue.current.then(async () => {
      const id = wanted.current;
      if (target.state === 'closed' || target.sinkId === id) return;
      await target.setSinkId?.(id).catch((e: unknown) => {
        log.warn(`Unable to play the call on output ${id}`, e);
      });
    });
  }, [ctx, outputId]);

  return ctx;
}

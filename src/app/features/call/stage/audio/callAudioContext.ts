/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { logger } from 'matrix-js-sdk/lib/logger';

import { callPlaybackAtom } from '../../../../state/call';

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
};

/**
 * The audio context the call plays through, on the output device `outputId` ('' is the system
 * default).
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
    const created: SinkContext = new AudioContext({ latencyHint: 'interactive' });
    const report = (): void =>
      setPlayback((p) => ({
        state: created.state,
        sinkId: typeof created.sinkId === 'string' ? created.sinkId : '',
        failures: p?.failures ?? [],
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

  useEffect(() => {
    (ctx as SinkContext | undefined)
      ?.setSinkId?.(outputId)
      .catch((e: unknown) => log.warn(`Unable to play the call on output ${outputId}`, e));
  }, [ctx, outputId]);

  return ctx;
}

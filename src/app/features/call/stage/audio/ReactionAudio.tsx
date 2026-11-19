/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';

import { type CallViewModel } from '../../../../plugins/call/engine/state/CallViewModel/CallViewModel';
import { useLatest } from '../hooks';
import { allReactionSoundUrls, reactionSoundUrl } from './reactionSounds';

/** Decodes every reaction sound into the context, by URL; empty until they have loaded. */
function useReactionBuffers(ctx: AudioContext): Map<string, AudioBuffer> {
  const [buffers, setBuffers] = useState<Map<string, AudioBuffer>>(() => new Map());
  useEffect(() => {
    let stale = false;
    Promise.all(
      allReactionSoundUrls().map(async (url): Promise<[string, AudioBuffer] | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return [url, await ctx.decodeAudioData(await response.arrayBuffer())];
        } catch (e) {
          // A sound that does not load is not played; the call goes on.
          logger.warn(`Could not load reaction sound ${url}`, e);
          return null;
        }
      })
    ).then((loaded) => {
      if (!stale)
        setBuffers(new Map(loaded.filter((entry): entry is [string, AudioBuffer] => !!entry)));
    });
    return () => {
      stale = true;
    };
  }, [ctx]);
  return buffers;
}

function play(ctx: AudioContext, buffer: AudioBuffer, volume: number): void {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain).connect(ctx.destination);
  source.addEventListener('ended', () => gain.disconnect(), { once: true });
  source.start();
}

interface ReactionAudioProps {
  vm: CallViewModel;
  audioContext: AudioContext;
  /** Volume of the call's own sounds, 0-1. */
  volume: number;
  /** Nothing from the call is heard. */
  deafened: boolean;
}

/** Plays the sound of each new reaction in the call. */
export function ReactionAudio({ vm, audioContext, volume, deafened }: ReactionAudioProps): null {
  const buffers = useReactionBuffers(audioContext);
  const latest = useLatest({ buffers, volume, deafened });

  useEffect(() => {
    const subscription = vm.audibleReactions$.subscribe((names) => {
      const current = latest.current;
      if (current.deafened) return;
      names.forEach((name) => {
        const buffer = current.buffers.get(reactionSoundUrl(name));
        if (buffer) play(audioContext, buffer, current.volume);
      });
    });
    return () => subscription.unsubscribe();
  }, [vm, audioContext, latest]);

  return null;
}

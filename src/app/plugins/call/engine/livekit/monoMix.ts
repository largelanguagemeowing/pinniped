/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * A node that mixes whatever feeds it down to one channel. A gain pinned to one channel with the
 * "speakers" interpretation does the standard downmix (stereo: half of left plus half of right),
 * so a mono input passes unchanged.
 */
export function createMonoMix(ctx: AudioContext): GainNode {
  const mix = ctx.createGain();
  mix.channelCount = 1;
  mix.channelCountMode = 'explicit';
  mix.channelInterpretation = 'speakers';
  return mix;
}

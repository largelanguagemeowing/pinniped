/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { LocalVideoTrack, type Room, Track } from 'livekit-client';

import { type ScreenShareQuality } from '../../types';
import { screenShareBudget } from './options';

/**
 * Applies a new quality to a screen share that is already running: the
 * capture's size and frame rate, and the encoder's bitrate and frame-rate caps.
 * No-op without a share; the next one starts with the setting anyway.
 */
export async function applyScreenShareQuality(
  room: Room,
  quality: ScreenShareQuality
): Promise<void> {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
  if (!(track instanceof LocalVideoTrack)) return;
  const budget = screenShareBudget(quality);
  await track.mediaStreamTrack.applyConstraints({
    width: { ideal: budget.width },
    height: { ideal: budget.height },
    frameRate: { ideal: budget.frameRate },
  });
  const sender = track.sender;
  if (!sender) return;
  const params = sender.getParameters();
  for (const encoding of params.encodings) {
    encoding.maxBitrate = budget.maxBitrate;
    encoding.maxFramerate = budget.frameRate;
  }
  await sender.setParameters(params);
}

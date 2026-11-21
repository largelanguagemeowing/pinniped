/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { LocalVideoTrack, type Room, Track } from 'livekit-client';

import { type ScreenShareContent, type ScreenShareQuality } from '../../types';
import { screenShareBudget, screenShareContentHints, screenShareEncoding } from './options';

type Size = { width: number; height: number };

const screenShareTrack = (room: Room): LocalVideoTrack | undefined => {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
  return track instanceof LocalVideoTrack ? track : undefined;
};

/** Encoders want even sizes. */
const even = (n: number): number => Math.max(2, 2 * Math.floor(n / 2));

/**
 * The capture size for a source: its own aspect ratio with at most the budget's pixels, so an
 * ultrawide screen or a portrait window gets as many pixels as a 16:9 one would. A source within
 * the budget keeps its size; capture only scales down.
 */
export function fitToBudget(source: Size, budget: Size): Size {
  const scale = Math.sqrt((budget.width * budget.height) / (source.width * source.height));
  if (scale >= 1) return source;
  return { width: even(source.width * scale), height: even(source.height * scale) };
}

/** The shared surface's own size, which Chromium reports as the capture's largest. */
function sourceSize(track: MediaStreamTrack): Size | undefined {
  const { width, height } = track.getCapabilities?.() ?? {};
  return width?.max && height?.max ? { width: width.max, height: height.max } : undefined;
}

/**
 * Capture constraints for a quality. Chromium scales a capture into the width and height,
 * keeping the source's aspect ratio, so they are the budget fitted to the source; where the
 * browser does not report the source's size, the budget's 16:9 box.
 */
export function screenShareConstraints(
  track: MediaStreamTrack,
  quality: ScreenShareQuality
): MediaTrackConstraints {
  const budget = screenShareBudget(quality);
  const source = sourceSize(track);
  const size = source ? fitToBudget(source, budget) : budget;
  return {
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: budget.frameRate },
  };
}

const ideal = (c: ConstrainULong | ConstrainDouble | undefined): number | undefined =>
  typeof c === 'object' ? c.ideal : c;

/**
 * Fits a running share's capture to its source at a quality. It changes the capture only when
 * that changes the constraints, so it can run whenever the source may have been resized.
 */
export async function fitScreenShare(room: Room, quality: ScreenShareQuality): Promise<void> {
  const track = screenShareTrack(room)?.mediaStreamTrack;
  if (!track) return;
  const wanted = screenShareConstraints(track, quality);
  const current = track.getConstraints();
  if (
    ideal(current.width) === ideal(wanted.width) &&
    ideal(current.height) === ideal(wanted.height) &&
    ideal(current.frameRate) === ideal(wanted.frameRate)
  )
    return;
  await track.applyConstraints(wanted);
}

/**
 * Applies a new quality to a screen share that is already running: the capture's size and
 * frame rate, and the encoder's bitrate and frame-rate caps. No-op without a share; the next one
 * starts with the setting anyway.
 */
export async function applyScreenShareQuality(
  room: Room,
  quality: ScreenShareQuality
): Promise<void> {
  const track = screenShareTrack(room);
  if (!track) return;
  await fitScreenShare(room, quality);
  const sender = track.sender;
  if (!sender) return;
  const encoding = screenShareEncoding(quality);
  const params = sender.getParameters();
  for (const e of params.encodings) {
    e.maxBitrate = encoding.maxBitrate;
    e.maxFramerate = encoding.maxFramerate;
  }
  await sender.setParameters(params);
}

/** Applies the content setting to a running share: what it keeps under load. */
export async function applyScreenShareContent(
  room: Room,
  content: ScreenShareContent
): Promise<void> {
  const track = screenShareTrack(room);
  if (!track) return;
  const hints = screenShareContentHints(content);
  track.mediaStreamTrack.contentHint = hints.contentHint;
  await track.setDegradationPreference(hints.degradationPreference);
}

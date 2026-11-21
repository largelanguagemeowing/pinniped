/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  AudioPresets,
  DefaultReconnectPolicy,
  type RoomOptions,
  type TrackPublishDefaults,
  type VideoEncoding,
  type VideoPreset,
  VideoPresets,
} from 'livekit-client';

import {
  type ScreenShareContent,
  type ScreenShareFps,
  type ScreenShareQuality,
  type ScreenShareResolution,
} from '../../types';

/** The room's screen share encoding until a share applies its own quality. */
const initialScreenShareQuality: ScreenShareQuality = { resolution: '720p', fps: 60 };

const HEIGHTS: Record<ScreenShareResolution, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  // Capture constraints only scale down, so this means "whatever the screen is".
  source: 4320,
};
// Bits per second at 30 fps. Few pixels with enough bits per frame look
// smoother than a larger picture starved on the estimated bandwidth.
const BITRATE_30: Record<ScreenShareResolution, number> = {
  '480p': 1_200_000,
  '720p': 2_500_000,
  '1080p': 5_000_000,
  '1440p': 8_000_000,
  source: 10_000_000,
};
const FPS_FACTOR: Record<ScreenShareFps, number> = { 15: 0.6, 30: 1, 60: 1.4 };

/** Capture size, frame rate and bitrate cap for a quality choice. */
export function screenShareBudget(q: ScreenShareQuality): {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
} {
  const height = HEIGHTS[q.resolution];
  return {
    width: Math.round((height * 16) / 9),
    height,
    frameRate: q.fps,
    maxBitrate: Math.round(BITRATE_30[q.resolution] * FPS_FACTOR[q.fps]),
  };
}

/** Highest budget of any choice, for the SDP's bitrate ceiling hint. */
export const screenShareMaxBitrate = screenShareBudget({
  resolution: 'source',
  fps: 60,
}).maxBitrate;

/**
 * The share's encoder caps. High priority: on a constrained uplink the share gets four times
 * the bandwidth share of the camera, which only has the default (low).
 */
export function screenShareEncoding(q: ScreenShareQuality): VideoEncoding {
  const budget = screenShareBudget(q);
  return { maxBitrate: budget.maxBitrate, maxFramerate: budget.frameRate, priority: 'high' };
}

/**
 * How the browser treats a share: motion keeps the frame rate and sheds resolution under load;
 * text is treated as screen content and keeps its sharpness, shedding frame rate instead.
 */
export function screenShareContentHints(content: ScreenShareContent): {
  contentHint: 'motion' | 'text';
  degradationPreference: RTCDegradationPreference;
} {
  return content === 'text'
    ? { contentHint: 'text', degradationPreference: 'maintain-resolution' }
    : { contentHint: 'motion', degradationPreference: 'maintain-framerate' };
}

const defaultLiveKitPublishOptions: TrackPublishDefaults = {
  // 96 kbps mono: browser-WebRTC default voice bitrates sound noticeably
  // worse; bandwidth is cheap next to that.
  // High priority: when the uplink is saturated, voice keeps its share (and its DSCP class
  // where the OS honours one) ahead of video.
  audioPreset: { ...AudioPresets.musicHighQuality, priority: 'high' },
  // Opus comfort noise (CNG) during silence is audible as persistent hiss.
  dtx: false,
  // disable red because the livekit server strips out red packets for clients
  // that don't support it (firefox) but of course that doesn't work with e2ee.
  red: false,
  forceStereo: false,
  // Overridden per room by the Publisher from the videoSimulcast setting.
  simulcast: false,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] as VideoPreset[],
  // The chosen quality and content override these when a share starts (see LocalMember).
  screenShareEncoding: screenShareEncoding(initialScreenShareQuality),
  degradationPreference: screenShareContentHints('motion').degradationPreference,
  stopMicTrackOnMute: false,
  // H.264: hardware-encoded on many machines, and every browser decodes it.
  videoCodec: 'h264',
  videoEncoding: VideoPresets.h720.encoding,
  backupCodec: { codec: 'vp8', encoding: VideoPresets.h720.encoding },
} as const;

export const defaultLiveKitOptions: RoomOptions = {
  // automatically manage subscribed video quality
  adaptiveStream: true,

  // optimize publishing bandwidth and CPU for published tracks
  dynacast: true,

  // capture settings
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },

  // publish settings
  publishDefaults: defaultLiveKitPublishOptions,

  // default LiveKit options that seem to be sane
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  webAudioMix: false,
};

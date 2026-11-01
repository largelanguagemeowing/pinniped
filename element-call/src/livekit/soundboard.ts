/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  AudioPresets,
  type LocalTrackPublication,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { Subject } from "rxjs";

import { soundboardVolume } from "../settings/settings";

/**
 * Soundboard commands from the embedding client (ElementWidgetActions.Soundboard).
 * `url` is a same-origin (blob:) URL of an audio file the client has already downloaded.
 */
export type SoundboardCommand = { op: "play"; url: string } | { op: "stop" };

export const soundboardCommand$ = new Subject<SoundboardCommand>();

/**
 * Plays client-supplied sounds to the call: mixed into an audio track of its
 * own that every participant hears (and that the local user hears too).
 * The microphone track, and whatever processing it has, is not touched.
 *
 * The track is published on the first sound and stays up, silent in between
 * (DTX keeps that nearly free), until the room is left.
 */
export class Soundboard {
  // Created on the first sound: most calls never use the soundboard.
  private audio:
    | { ctx: AudioContext; destination: MediaStreamAudioDestinationNode }
    | undefined;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly playing = new Set<AudioBufferSourceNode>();
  private publication: Promise<LocalTrackPublication | undefined> | undefined;
  // Bumped by stop(), so sounds still loading when it is called do not start.
  private stopGeneration = 0;

  public constructor(
    private readonly room: LivekitRoom,
    private readonly logger: Logger,
  ) {}

  private get ctx(): AudioContext {
    return this.output.ctx;
  }

  private get output(): {
    ctx: AudioContext;
    destination: MediaStreamAudioDestinationNode;
  } {
    if (!this.audio) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.audio = { ctx, destination: ctx.createMediaStreamDestination() };
    }
    return this.audio;
  }

  private async decode(url: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then(async (r) => r.arrayBuffer())
        .then(async (data) => this.ctx.decodeAudioData(data));
      // A failed decode must not poison later attempts at the same URL.
      buffer.catch(() => this.buffers.delete(url));
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  private async publish(): Promise<LocalTrackPublication | undefined> {
    // A disconnect unpublishes and (stopLocalTrackOnUnpublish) stops the track,
    // so a cached publication may point at an ended track. Start over with a
    // fresh destination in that case.
    const cached = await this.publication;
    if (cached && cached.track?.mediaStreamTrack.readyState === "ended") {
      this.publication = undefined;
      this.output.destination = this.output.ctx.createMediaStreamDestination();
    }
    this.publication ??= this.room.localParticipant
      .publishTrack(this.output.destination.stream.getAudioTracks()[0], {
        source: Track.Source.Unknown,
        name: "soundboard",
        dtx: true,
        red: false,
        audioPreset: AudioPresets.musicHighQuality,
      })
      .catch((e) => {
        this.logger.error("Failed to publish the soundboard track", e);
        this.publication = undefined;
        return undefined;
      });
    return this.publication;
  }

  public async play(url: string): Promise<void> {
    this.logger.info(`[sound] play soundboard (${url})`);
    const generation = this.stopGeneration;
    await this.ctx.resume();
    const [buffer] = await Promise.all([this.decode(url), this.publish()]);
    // stop() was called while this sound was still loading.
    if (generation !== this.stopGeneration) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    // The call gets the sound at full level: each listener scales what they hear with their own
    // soundboard volume. The local copy for the user is scaled the same way.
    const gain = this.ctx.createGain();
    const monitor = this.ctx.createGain();
    monitor.gain.value = Math.max(0, Math.min(soundboardVolume.getValue(), 1));
    source.connect(gain);
    gain.connect(this.output.destination);
    gain.connect(monitor);
    monitor.connect(this.ctx.destination);
    this.playing.add(source);
    source.addEventListener("ended", () => {
      this.playing.delete(source);
      source.disconnect();
      gain.disconnect();
      monitor.disconnect();
    });
    source.start();
  }

  public stop(): void {
    this.logger.info("[sound] stop soundboard");
    this.stopGeneration += 1;
    this.playing.forEach((source) => source.stop());
  }

  public async dispose(): Promise<void> {
    this.stop();
    const publication = await this.publication;
    if (publication?.track) {
      await this.room.localParticipant
        .unpublishTrack(publication.track)
        .catch(() => undefined);
    }
    await this.audio?.ctx.close().catch(() => undefined);
  }
}

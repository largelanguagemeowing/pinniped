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
import { combineLatest, Subject, type Subscription } from "rxjs";

import { soundboardVolume } from "../settings/settings";
import { localDeafened$ } from "./deafened";

/**
 * Soundboard commands from the embedding client (ElementWidgetActions.Soundboard).
 * `url` is a same-origin (blob:) URL of an audio file the client has already downloaded.
 */
export type SoundboardCommand =
  { op: "play"; url: string; mode?: "cut" | "add" } | { op: "stop" };

export const soundboardCommand$ = new Subject<SoundboardCommand>();

/**
 * How loud the user hears their own soundboard sounds: their soundboard volume,
 * and nothing at all while deafened. Deafened means no sound from the call, the
 * user's own included; the call still gets the sound.
 */
export const soundboardMonitorLevel = (
  volume: number,
  deafened: boolean,
): number => (deafened ? 0 : Math.max(0, Math.min(volume, 1)));

/** A mono output for the soundboard track, so its Opus parameters match the microphone's. */
function createMonoDestination(
  ctx: AudioContext,
): MediaStreamAudioDestinationNode {
  const destination = ctx.createMediaStreamDestination();
  destination.channelCount = 1;
  destination.channelCountMode = "explicit";
  return destination;
}

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
  private readonly playing = new Map<AudioBufferSourceNode, string>();
  // Per URL, bumped when a "cut" play restarts that sound, so an earlier click still
  // loading does not start on top of the newer one.
  private readonly restartGeneration = new Map<string, number>();
  private publication: Promise<LocalTrackPublication | undefined> | undefined;
  // Bumped by stop(), so sounds still loading when it is called do not start.
  private stopGeneration = 0;
  // The listener's own copy of each sound still playing, so the soundboard volume
  // and deafening apply to sounds already playing as well as new ones.
  private readonly monitors = new Set<GainNode>();
  private readonly volumeSub: Subscription;

  public constructor(
    private readonly room: LivekitRoom,
    private readonly logger: Logger,
  ) {
    this.volumeSub = combineLatest([
      soundboardVolume.value$,
      localDeafened$,
    ]).subscribe(([volume, deafened]) => {
      const level = soundboardMonitorLevel(volume, deafened);
      this.monitors.forEach((monitor) => {
        monitor.gain.value = level;
      });
    });
  }

  private get ctx(): AudioContext {
    return this.output.ctx;
  }

  private get output(): {
    ctx: AudioContext;
    destination: MediaStreamAudioDestinationNode;
  } {
    if (!this.audio) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.audio = { ctx, destination: createMonoDestination(ctx) };
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
      this.output.destination = createMonoDestination(this.output.ctx);
    }
    this.publication ??= this.room.localParticipant
      .publishTrack(this.output.destination.stream.getAudioTracks()[0], {
        source: Track.Source.Unknown,
        name: "soundboard",
        // Mono, DTX off: the microphone's Opus parameters. Chrome refuses a call when the two
        // audio tracks disagree on them (a BUNDLE codec collision).
        dtx: false,
        forceStereo: false,
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

  /**
   * `mode` "cut" stops this sound's copies that are still playing (or loading) first, so a
   * repeated click starts it over; "add" (the default) layers another copy on top. Other
   * sounds are not affected either way.
   */
  public async play(url: string, mode: "cut" | "add" = "add"): Promise<void> {
    this.logger.info(`[sound] play soundboard (${url}, ${mode})`);
    if (mode === "cut") {
      this.restartGeneration.set(
        url,
        (this.restartGeneration.get(url) ?? 0) + 1,
      );
      this.playing.forEach((playingUrl, source) => {
        if (playingUrl === url) source.stop();
      });
    }
    const generation = this.stopGeneration;
    const restart = this.restartGeneration.get(url);
    await this.ctx.resume();
    const [buffer] = await Promise.all([this.decode(url), this.publish()]);
    // stop() was called while this sound was still loading.
    if (generation !== this.stopGeneration) return;
    // A later "cut" click on this sound took over while it was loading.
    if (restart !== this.restartGeneration.get(url)) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    // The call gets the sound at full level: each listener scales what they hear with their own
    // soundboard volume. The local copy for the user is scaled the same way.
    const gain = this.ctx.createGain();
    const monitor = this.ctx.createGain();
    monitor.gain.value = soundboardMonitorLevel(
      soundboardVolume.getValue(),
      localDeafened$.value,
    );
    source.connect(gain);
    gain.connect(this.output.destination);
    gain.connect(monitor);
    monitor.connect(this.ctx.destination);
    this.playing.set(source, url);
    this.monitors.add(monitor);
    source.addEventListener("ended", () => {
      this.playing.delete(source);
      this.monitors.delete(monitor);
      source.disconnect();
      gain.disconnect();
      monitor.disconnect();
    });
    source.start();
  }

  public stop(): void {
    this.logger.info("[sound] stop soundboard");
    this.stopGeneration += 1;
    this.playing.forEach((_url, source) => source.stop());
  }

  public async dispose(): Promise<void> {
    this.volumeSub.unsubscribe();
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

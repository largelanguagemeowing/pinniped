/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger } from 'matrix-js-sdk/lib/logger';

import { screenShareMaxBitrate } from './options';

const logger = rootLogger.getChild('[BitrateHints]');

/**
 * Chrome's congestion control starts a video sender at ~300 kbps and ramps up
 * slowly (and backs off hard on any loss), so a 1080p60 screen share spends a
 * long time starved. Pages cannot tune it, but Chrome honours the
 * `x-google-*-bitrate` fmtp hints (kbps) in the remote SDP: a higher start
 * estimate and a floor under the encoder's target.
 */
const START_KBPS = 3000;
const MIN_KBPS = 800;

const PASSIVE_CODECS = /^(rtx|red|ulpfec|flexfec-03)$/i;

/**
 * Opus parameters for the audio we send, written into the answer because that is
 * where Chrome reads its sender configuration from. In-band FEC is on: Opus only
 * spends bits on redundancy while RTCP reports loss, so a clean link costs nothing,
 * and on a lossy one an isolated lost packet is recovered from the next one
 * instead of concealed (there is no RED, see `options.ts`). `sprop-stereo` is dropped:
 * it only hints what the remote end sends, and livekit-client sets it on stereo
 * tracks only, so mono and stereo audio sections (microphone, soundboard) would
 * otherwise carry different parameters for the one bundled Opus payload type,
 * which Chrome rejects ("BUNDLE group contains a codec collision").
 */
export function setOpusParameters(sdp: string): string {
  const lines = sdp.split('\r\n');
  const opus = new Set<string>();
  let inAudio = false;
  for (const line of lines) {
    if (line.startsWith('m=')) inAudio = line.startsWith('m=audio');
    const m = /^a=rtpmap:(\d+) opus\//i.exec(line);
    if (inAudio && m) opus.add(m[1]);
  }
  if (opus.size === 0) return sdp;
  const params = (config: string): string => {
    const kept = config
      .split(';')
      .filter((p) => !/^(|useinbandfec=.*|sprop-stereo=.*)$/.test(p.trim()));
    return [...kept, 'useinbandfec=1'].join(';');
  };
  const out: string[] = [];
  const seen = new Set<string>();
  inAudio = false;
  for (const line of lines) {
    if (line.startsWith('m=')) {
      inAudio = line.startsWith('m=audio');
      out.push(line);
      continue;
    }
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (inAudio && fmtp && opus.has(fmtp[1])) {
      seen.add(fmtp[1]);
      out.push(`a=fmtp:${fmtp[1]} ${params(fmtp[2])}`);
      continue;
    }
    out.push(line);
    // Opus without an fmtp line gets one straight after its rtpmap.
    const rtpmap = /^a=rtpmap:(\d+) opus\//i.exec(line);
    if (inAudio && rtpmap && !lines.some((l) => l.startsWith(`a=fmtp:${rtpmap[1]} `))) {
      out.push(`a=fmtp:${rtpmap[1]} ${params('')}`);
    }
  }
  return out.join('\r\n');
}

/** Adds the bitrate hints to every real video codec in the SDP. */
export function addBitrateHints(sdp: string, maxKbps: number): string {
  const hints = `x-google-start-bitrate=${START_KBPS};x-google-min-bitrate=${MIN_KBPS};x-google-max-bitrate=${maxKbps}`;
  const lines = sdp.split('\r\n');
  const out: string[] = [];
  // The payload types of the current m=video section whose fmtp needs hints.
  let video: string[] = [];
  let inVideo = false;
  const fmtpSeen = new Set<string>();
  const flush = (): void => {
    // Codecs without an fmtp line (VP8) get one right after their rtpmap.
    for (let i = out.length - 1; i >= 0 && video.length > 0; i--) {
      const m = /^a=rtpmap:(\d+) /.exec(out[i]);
      if (m && video.includes(m[1]) && !fmtpSeen.has(m[1])) {
        out.splice(i + 1, 0, `a=fmtp:${m[1]} ${hints}`);
      }
    }
  };
  for (const line of lines) {
    if (line.startsWith('m=')) {
      if (inVideo) flush();
      inVideo = line.startsWith('m=video');
      video = [];
      fmtpSeen.clear();
      out.push(line);
      continue;
    }
    const rtpmap = /^a=rtpmap:(\d+) ([^/]+)\//.exec(line);
    if (inVideo && rtpmap && !PASSIVE_CODECS.test(rtpmap[2])) {
      video.push(rtpmap[1]);
    }
    const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (inVideo && fmtp && !/apt=/.test(fmtp[2])) {
      fmtpSeen.add(fmtp[1]);
      out.push(`${line};${hints}`);
      continue;
    }
    out.push(line);
  }
  if (inVideo) flush();
  return out.join('\r\n');
}

const CONGESTION_FEEDBACK = /^(transport-cc|goog-remb|ack ccfb)$/;

/**
 * The congestion-control feedback each payload type offers, per media section,
 * e.g. `video 1: 96 VP8 [transport-cc goog-remb] | 97 rtx []`. Chrome ignores
 * all of it ("Inconsistent congestion control feedback types") when the payload
 * types of a section disagree, which leaves bandwidth estimation without feedback.
 */
export function summarizeCongestionFeedback(sdp: string): string[] {
  const out: string[] = [];
  let header = '';
  let names = new Map<string, string>();
  let feedback = new Map<string, string[]>();
  const flush = (): void => {
    if (header === '') return;
    const codecs = [...names].map(
      ([pt, name]) =>
        `${pt} ${name} [${[...(feedback.get(pt) ?? []), ...(feedback.get('*') ?? [])].join(' ')}]`
    );
    out.push(`${header}: ${codecs.join(' | ')}`);
  };
  for (const line of sdp.split('\r\n')) {
    const m = /^m=(\w+) /.exec(line);
    if (m) {
      flush();
      header = m[1];
      names = new Map();
      feedback = new Map();
      continue;
    }
    const midLine = /^a=mid:(.+)$/.exec(line);
    if (midLine) header = `${header.split(' ')[0]} ${midLine[1]}`;
    const rtpmap = /^a=rtpmap:(\d+) ([^/]+)\//.exec(line);
    if (rtpmap) names.set(rtpmap[1], rtpmap[2]);
    const fb = /^a=rtcp-fb:(\S+) (.+)$/.exec(line);
    if (fb && CONGESTION_FEEDBACK.test(fb[2])) {
      feedback.set(fb[1], [...(feedback.get(fb[1]) ?? []), fb[2]]);
    }
  }
  flush();
  return out;
}

/**
 * Patches the answers our peer connections receive. The subscriber's offers
 * from the SFU are left alone: those hints would configure its receiving side.
 */
export function installBitrateHints(): void {
  if (typeof RTCPeerConnection === 'undefined') return;
  const proto = RTCPeerConnection.prototype;
  const original = proto.setRemoteDescription;
  proto.setRemoteDescription = async function (
    this: RTCPeerConnection,
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    if (description?.type === 'answer' && description.sdp) {
      logger.info(
        `answer congestion feedback: ${summarizeCongestionFeedback(description.sdp).join('; ')}`
      );
    }
    const patched =
      description?.type === 'answer' && description.sdp
        ? {
            ...description,
            sdp: setOpusParameters(
              addBitrateHints(description.sdp, Math.round(screenShareMaxBitrate / 1000))
            ),
          }
        : description;
    return Reflect.apply(original, this, [patched]) as Promise<void>;
  } as typeof original;
}

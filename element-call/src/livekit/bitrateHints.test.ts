/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { addBitrateHints, disableOpusFec } from "./bitrateHints";

const sdp = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "m=video 9 UDP/TLS/RTP/SAVPF 96 97 102 103",
  "a=rtpmap:96 VP8/90000",
  "a=rtpmap:97 rtx/90000",
  "a=fmtp:97 apt=96",
  "a=rtpmap:102 H264/90000",
  "a=fmtp:102 level-asymmetry-allowed=1;profile-level-id=42e01f",
  "a=rtpmap:103 red/90000",
  "",
].join("\r\n");

describe("addBitrateHints", () => {
  const out = addBitrateHints(sdp, 5000).split("\r\n");

  it("appends hints to an existing video fmtp line", () => {
    expect(out).toContain(
      "a=fmtp:102 level-asymmetry-allowed=1;profile-level-id=42e01f;x-google-start-bitrate=3000;x-google-min-bitrate=800;x-google-max-bitrate=5000",
    );
  });

  it("adds an fmtp line for codecs without one", () => {
    const i = out.indexOf("a=rtpmap:96 VP8/90000");
    expect(out[i + 1]).toMatch(/^a=fmtp:96 x-google-start-bitrate=3000/);
  });

  it("leaves audio, rtx and red alone", () => {
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1");
    expect(out).toContain("a=fmtp:97 apt=96");
    expect(out.some((l) => l.startsWith("a=fmtp:103"))).toBe(false);
  });
});

describe("disableOpusFec", () => {
  it("turns in-band FEC off for Opus", () => {
    expect(disableOpusFec(sdp).split("\r\n")).toContain(
      "a=fmtp:111 minptime=10;useinbandfec=0",
    );
  });

  it("adds an fmtp line when Opus has none", () => {
    const bare = [
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
      "",
    ].join("\r\n");
    expect(disableOpusFec(bare).split("\r\n")).toContain(
      "a=fmtp:111 useinbandfec=0",
    );
  });

  it("leaves video and SDP without Opus alone", () => {
    const out = disableOpusFec(sdp).split("\r\n");
    expect(out).toContain("a=fmtp:97 apt=96");
    const noAudio = [
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "a=rtpmap:96 VP8/90000",
      "",
    ].join("\r\n");
    expect(disableOpusFec(noAudio)).toBe(noAudio);
  });
});

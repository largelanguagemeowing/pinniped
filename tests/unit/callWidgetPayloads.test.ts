import { describe, expect, it } from 'vitest';
import { parseCallSoundCommand } from '../../src/app/plugins/call/types';
import { parseCallStatsSample } from '../../src/app/plugins/call/stats';

describe('parseCallSoundCommand', () => {
  it('reads the three commands the widget sends', () => {
    expect(parseCallSoundCommand({ op: 'play', sound: 'join' })).toEqual({
      op: 'play',
      sound: 'join',
    });
    expect(
      parseCallSoundCommand({ op: 'loop', sound: 'waiting', intro: 'waitingIntro', id: 3 })
    ).toEqual({ op: 'loop', sound: 'waiting', intro: 'waitingIntro', id: 3 });
    expect(parseCallSoundCommand({ op: 'loop', sound: 'waiting', id: 3 })).toEqual({
      op: 'loop',
      sound: 'waiting',
      id: 3,
    });
    expect(parseCallSoundCommand({ op: 'stop', id: 3 })).toEqual({ op: 'stop', id: 3 });
  });

  it('ignores anything malformed', () => {
    expect(parseCallSoundCommand(undefined)).toBeUndefined();
    expect(parseCallSoundCommand('play')).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'play' })).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'play', sound: 5 })).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'loop', sound: 'waiting' })).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'stop', id: '3' })).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'stop', id: 1.5 })).toBeUndefined();
    expect(parseCallSoundCommand({ op: 'explode', sound: 'join' })).toBeUndefined();
  });
});

const stream = {
  kind: 'audio',
  ssrc: 1234,
  codec: 'audio/opus',
  sdpFmtpLine: 'minptime=10;useinbandfec=0',
  stats: { packetsSent: 10, bytesSent: 1000, active: true, mid: '0' },
  remote: { roundTripTime: 0.02 },
  track: 'Microphone',
};

const sample = {
  time: 1_700_000_000_000,
  connections: [
    {
      host: 'sfu.example.org',
      rtt: 21,
      transport: { bytesSent: 5000, bytesReceived: 7000, protocol: 'udp' },
      outbound: [stream],
      inbound: [{ ...stream, ssrc: 99, participant: '@alice:example.org' }],
    },
  ],
};

describe('parseCallStatsSample', () => {
  it('reads a sample as the widget sends it', () => {
    const parsed = parseCallStatsSample(sample);
    expect(parsed?.time).toBe(sample.time);
    expect(parsed?.connections[0].host).toBe('sfu.example.org');
    expect(parsed?.connections[0].rtt).toBe(21);
    expect(parsed?.connections[0].transport).toEqual({
      bytesSent: 5000,
      bytesReceived: 7000,
      protocol: 'udp',
      availableOutgoingBitrate: undefined,
    });
    expect(parsed?.connections[0].outbound[0]).toMatchObject(stream);
    expect(parsed?.connections[0].inbound[0].participant).toBe('@alice:example.org');
  });

  it('accepts a connection without a round-trip time yet', () => {
    const noRtt = { ...sample, connections: [{ ...sample.connections[0], rtt: null }] };
    expect(parseCallStatsSample(noRtt)?.connections[0].rtt).toBeNull();
  });

  it('leaves out stat values it cannot show', () => {
    const odd = {
      ...sample,
      connections: [
        {
          ...sample.connections[0],
          outbound: [{ ...stream, stats: { bytesSent: 1, nested: { x: 1 }, bad: NaN } }],
        },
      ],
    };
    expect(parseCallStatsSample(odd)?.connections[0].outbound[0].stats).toEqual({ bytesSent: 1 });
  });

  it('drops a sample with any malformed part', () => {
    expect(parseCallStatsSample(undefined)).toBeUndefined();
    expect(parseCallStatsSample({ connections: [] })).toBeUndefined();
    expect(parseCallStatsSample({ time: 1, connections: {} })).toBeUndefined();
    const conn = sample.connections[0];
    const withConnection = (c: unknown) => parseCallStatsSample({ time: 1, connections: [c] });
    expect(withConnection({ ...conn, host: 1 })).toBeUndefined();
    expect(withConnection({ ...conn, rtt: '21' })).toBeUndefined();
    expect(withConnection({ ...conn, transport: { bytesSent: 1 } })).toBeUndefined();
    expect(withConnection({ ...conn, inbound: undefined })).toBeUndefined();
    expect(withConnection({ ...conn, outbound: [{ ...stream, ssrc: 'x' }] })).toBeUndefined();
    expect(withConnection({ ...conn, outbound: [{ ...stream, stats: null }] })).toBeUndefined();
  });
});

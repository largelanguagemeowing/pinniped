// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import type { RemoteTrackPublication } from 'livekit-client';

import { TrackAudio } from '../../../src/app/features/call/stage/audio/RoomAudio';

// A remote track recording which output it is set to and when it is attached.
const fakeTrack = () => {
  const events: string[] = [];
  let sinkId = '';
  const where = () => sinkId || 'default';
  const track = {
    events,
    setSinkId: async (id: string) => {
      sinkId = id;
      events.push(`output ${where()}`);
    },
    setAudioContext: () => undefined,
    setWebAudioPlugins: () => undefined,
    attach: () => events.push(`attached on ${where()}`),
    detach: () => events.push('detached'),
    setVolume: () => undefined,
  };
  return track;
};

const node = () => ({ disconnect: () => undefined });
const callContext = {
  createGain: () => ({ ...node(), gain: { value: 1 } }),
  createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
} as unknown as AudioContext;

const renderers: ReactTestRenderer[] = [];
afterEach(() => {
  renderers.splice(0).forEach((r) => act(() => r.unmount()));
});

const mount = (outputId: string, audioContext: AudioContext | undefined) => {
  const track = fakeTrack();
  const publication = { track, setEnabled: () => undefined } as unknown as RemoteTrackPublication;
  const element = (id: string) => (
    <TrackAudio
      publication={publication}
      kind="voice"
      level={1}
      muted={false}
      audioContext={audioContext}
      outputId={id}
    />
  );
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element(outputId), { createNodeMock: () => ({ muted: false }) });
  });
  renderers.push(renderer);
  return { track, rerender: (id: string) => act(() => renderer.update(element(id))) };
};

describe.each([
  ['through the call context', callContext],
  ['through its element', undefined],
])("a call track played %s plays on the call's output", (_, audioContext) => {
  it('from the start: the output is set before the track is attached', () => {
    const { track } = mount('headphones', audioContext);
    expect(track.events).toEqual(['output headphones', 'attached on headphones']);
  });

  it('on the system default when none is chosen', () => {
    const { track } = mount('', audioContext);
    expect(track.events).toEqual(['output default', 'attached on default']);
  });

  it('and follows a newly chosen one without being attached again', () => {
    const { track, rerender } = mount('headphones', audioContext);
    rerender('speakers');
    expect(track.events).toEqual([
      'output headphones',
      'attached on headphones',
      'output speakers',
    ]);
  });
});

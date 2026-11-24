import React from 'react';
import type { RefObject } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { useCallRing } from '../../src/app/hooks/useCallRing';

const setup = (shouldRing: boolean) => {
  const audio = { play: vi.fn(), pause: vi.fn() };
  const ref = { current: audio } as unknown as RefObject<HTMLAudioElement>;
  let result!: ReturnType<typeof useCallRing>;
  function Harness({ ring }: { ring: boolean }) {
    result = useCallRing(ref, ring);
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Harness ring={shouldRing} />);
  });
  return { audio, renderer, Harness, get: () => result };
};

describe('useCallRing', () => {
  it('rings while asked to and stops when unmounted', () => {
    const { audio, renderer } = setup(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });

  it('stays silent when not asked to ring', () => {
    const { audio, get } = setup(false);
    expect(audio.play).not.toHaveBeenCalled();
    expect(get().ringing).toBe(false);
  });

  it('silence stops the ring and keeps it stopped', () => {
    const { audio, renderer, Harness, get } = setup(true);
    expect(get().ringing).toBe(true);
    act(() => get().silence());
    expect(get().ringing).toBe(false);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    act(() => renderer.update(<Harness ring />));
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});

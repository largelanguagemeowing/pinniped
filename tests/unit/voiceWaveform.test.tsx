import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { VoiceWaveform } from '../../src/app/components/message/content/VoiceWaveform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WAVEFORM = [0, 256, 512, 1024];

const render = async (props: Partial<React.ComponentProps<typeof VoiceWaveform>> = {}) => {
  const onSeek = vi.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <VoiceWaveform
        waveform={WAVEFORM}
        currentTime={0}
        duration={10}
        onSeek={onSeek}
        valueText="0:00 of 0:10"
        {...props}
      />
    );
  });
  const slider = renderer.root.findByProps({ role: 'slider' });
  const bars = slider.children as ReturnType<typeof create>['root'][];
  return { slider, bars, onSeek };
};

describe('VoiceWaveform', () => {
  it('draws one bar per sample, scaled to the loudest (at least the 0-1024 range)', async () => {
    const { bars } = await render();
    const heights = bars.map((bar) => bar.props.style.height);
    expect(heights).toEqual(['10%', '25%', '50%', '100%']);
  });

  it('fills the bars up to the playback position', async () => {
    const { bars } = await render({ currentTime: 5 });
    const filled = bars.map((bar) => bar.props.style.backgroundColor);
    expect(filled[0]).toBe(filled[1]);
    expect(filled[2]).not.toBe(filled[1]);
    expect(filled[3]).toBe(filled[2]);
  });

  it('seeks with the arrow keys and stays put while the duration is unknown', async () => {
    const seekable = await render({ currentTime: 8 });
    seekable.slider.props.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(seekable.onSeek).toHaveBeenLastCalledWith(10);
    seekable.slider.props.onKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() });
    expect(seekable.onSeek).toHaveBeenLastCalledWith(3);

    const unknown = await render({ duration: 0 });
    unknown.slider.props.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(unknown.onSeek).not.toHaveBeenCalled();
  });
});

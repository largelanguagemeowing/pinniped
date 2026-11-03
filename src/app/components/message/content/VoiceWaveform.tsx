import React, { KeyboardEventHandler, PointerEventHandler, useRef } from 'react';
import { color, toRem } from 'folds';

/** MSC1767 waveform samples run from 0 to 1024. */
const WAVEFORM_MAX = 1024;
const MIN_BAR = 0.1;
const KEY_SEEK_SECONDS = 5;

type VoiceWaveformProps = {
  /** MSC1767 samples (0-1024), one bar each. */
  waveform: number[];
  /** Seconds. */
  currentTime: number;
  /** Seconds, 0 when not known yet. */
  duration: number;
  onSeek: (seconds: number) => void;
  valueText: string;
};
/** The bars of a voice message: the played part is filled, and a click or drag seeks. */
export function VoiceWaveform({
  waveform,
  currentTime,
  duration,
  onSeek,
  valueText,
}: VoiceWaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const seekable = duration > 0;
  const progress = seekable ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
  const peak = Math.max(WAVEFORM_MAX, ...waveform);

  const seekTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !seekable) return;
    const { left, width } = track.getBoundingClientRect();
    if (width <= 0) return;
    onSeek(Math.min(Math.max((clientX - left) / width, 0), 1) * duration);
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (evt) => {
    if (!seekable) return;
    dragging.current = true;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    seekTo(evt.clientX);
  };
  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (evt) => {
    if (dragging.current) seekTo(evt.clientX);
  };
  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (evt) => {
    dragging.current = false;
    evt.currentTarget.releasePointerCapture(evt.pointerId);
  };
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (evt) => {
    if (!seekable) return;
    if (evt.key === 'ArrowRight') onSeek(Math.min(currentTime + KEY_SEEK_SECONDS, duration));
    else if (evt.key === 'ArrowLeft') onSeek(Math.max(currentTime - KEY_SEEK_SECONDS, 0));
    else return;
    evt.preventDefault();
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={seekable ? 0 : -1}
      aria-label="Seek voice message"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={valueText}
      aria-disabled={!seekable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      style={{
        alignItems: 'center',
        cursor: seekable ? 'pointer' : 'default',
        display: 'flex',
        gap: toRem(2),
        height: toRem(28),
        touchAction: 'none',
        // A fixed width per bar keeps a short clip from stretching into blocks.
        width: `min(100%, ${toRem(waveform.length * 5)})`,
      }}
    >
      {waveform.map((sample, index) => {
        const played = (index + 0.5) / waveform.length <= progress;
        return (
          <div
            // The samples have no identity of their own; the bars never reorder.
            key={index}
            style={{
              backgroundColor: played ? color.Primary.Main : color.Secondary.ContainerLine,
              borderRadius: toRem(2),
              flex: '1 1 0',
              height: `${Math.max(sample / peak, MIN_BAR) * 100}%`,
              maxWidth: toRem(3),
              minWidth: toRem(1),
            }}
          />
        );
      })}
    </div>
  );
}

import React, { CSSProperties } from 'react';
import classNames from 'classnames';
import * as css from './Slider.css';

type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
};
export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      className={classNames(css.Slider, className)}
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(evt) => onChange(Number(evt.currentTarget.value))}
      style={{ '--fill': `${fill}%` } as CSSProperties}
    />
  );
}

// Loudness is perceived roughly as a power of amplitude, so the slider travels
// in perceptual space and the volume is its square.
const VOLUME_EXPONENT = 2;
// Steps along the travel; 0.1% resolution, so the low end is not coarse.
const VOLUME_STEPS = 1000;

/** Where a linear gain sits on the slider's travel, 0..100 (percent of the track). */
export function volumeSliderPercent(value: number, max = 1): number {
  const position = Math.min(1, Math.max(0, value / max)) ** (1 / VOLUME_EXPONENT);
  return Math.round(position * VOLUME_STEPS) / (VOLUME_STEPS / 100);
}

type VolumeSliderProps = Omit<SliderProps, 'min' | 'max' | 'step' | 'value' | 'onChange'> & {
  /** Linear gain, 0..max. */
  value: number;
  max?: number;
  onChange: (volume: number) => void;
};
/** A slider for a linear volume/gain with 0.1% steps along a power curve. */
export function VolumeSlider({ value, max = 1, onChange, ...props }: VolumeSliderProps) {
  const position = Math.round(
    Math.min(1, Math.max(0, value / max)) ** (1 / VOLUME_EXPONENT) * VOLUME_STEPS
  );
  return (
    <Slider
      {...props}
      min={0}
      max={VOLUME_STEPS}
      step={1}
      value={position}
      onChange={(next) =>
        onChange(Math.round(max * (next / VOLUME_STEPS) ** VOLUME_EXPONENT * 1e4) / 1e4)
      }
    />
  );
}

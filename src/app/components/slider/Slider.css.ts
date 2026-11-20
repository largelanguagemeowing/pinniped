import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { inputModeSelector } from '../../utils/inputMode';
import { FocusRingOffset, FocusRingOutline } from '../../styles/FocusRing.css';

const TRACK = toRem(6);
const THUMB = toRem(16);

// `--fill` is the filled share of the track, set inline by the component.
export const Slider = style({
  appearance: 'none',
  WebkitAppearance: 'none',
  width: toRem(140),
  height: THUMB,
  margin: 0,
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  outline: 'none',

  selectors: {
    '&:disabled': { opacity: config.opacity.Disabled, cursor: 'not-allowed' },
  },
});

const track = {
  height: TRACK,
  borderRadius: TRACK,
  border: 'none',
  background: `linear-gradient(to right, ${color.Primary.Main} var(--fill), ${color.SurfaceVariant.ContainerLine} var(--fill))`,
};

const thumb = {
  width: THUMB,
  height: THUMB,
  borderRadius: '50%',
  border: `${toRem(3)} solid ${color.Primary.Main}`,
  background: color.Primary.OnMain,
  boxSizing: 'border-box' as const,
  transition: 'transform 100ms ease',
};

globalStyle(`${Slider}::-webkit-slider-runnable-track`, track);
globalStyle(`${Slider}::-moz-range-track`, track);

globalStyle(`${Slider}::-webkit-slider-thumb`, {
  ...thumb,
  WebkitAppearance: 'none',
  appearance: 'none',
  marginTop: `calc((${TRACK} - ${THUMB}) / 2)`,
});
globalStyle(`${Slider}::-moz-range-thumb`, thumb);

globalStyle(`${Slider}:hover::-webkit-slider-thumb, ${Slider}:active::-webkit-slider-thumb`, {
  transform: 'scale(1.15)',
});
globalStyle(`${Slider}:hover::-moz-range-thumb, ${Slider}:active::-moz-range-thumb`, {
  transform: 'scale(1.15)',
});
const keyboard = inputModeSelector('keyboard');
globalStyle(`${keyboard} ${Slider}:focus-visible::-webkit-slider-thumb`, {
  outline: FocusRingOutline,
  outlineOffset: FocusRingOffset,
});
globalStyle(`${keyboard} ${Slider}:focus-visible::-moz-range-thumb`, {
  outline: FocusRingOutline,
  outlineOffset: FocusRingOffset,
});

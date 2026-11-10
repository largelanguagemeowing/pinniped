import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const LiveSpeakerIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.Success.Main,
});

export const LiveTimer = style({
  color: color.Success.Main,
  fontVariantNumeric: 'tabular-nums',
});

export const CallStatus = style([
  {
    padding: `${toRem(8)} ${config.space.S200}`,
    borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
  },
]);

export const ControlDivider = style({
  height: toRem(16),
});

export const SpeakerAvatarOutline = style({
  boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Success.Main}`,
});

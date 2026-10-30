import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

// Below this width the aside stacks under the form instead of sitting beside it.
const WIDE = 'screen and (min-width: 960px)';

export const AuthLayout = style({
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  '@media': {
    [WIDE]: {
      flexDirection: 'row',
    },
  },
});

export const AuthMain = style({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  padding: `${config.space.S500} ${config.space.S400} 0`,
  '@media': {
    [WIDE]: {
      flexGrow: 0,
      flexShrink: 0,
      width: toRem(560),
      padding: `${config.space.S600} ${config.space.S700} 0`,
    },
  },
});

export const AuthBrand = style({
  alignItems: 'center',
  gap: config.space.S200,
});

export const AuthLogo = style([
  DefaultReset,
  {
    width: toRem(28),
    height: toRem(28),
    borderRadius: '50%',
  },
]);

export const AuthContent = style({
  width: '100%',
  maxWidth: toRem(400),
  margin: '0 auto',
  paddingTop: config.space.S700,
  paddingBottom: config.space.S700,
  gap: config.space.S600,
  '@media': {
    [WIDE]: {
      // Centre the form against the full-height column, text stays left-aligned.
      marginTop: 'auto',
      marginBottom: 'auto',
      paddingTop: config.space.S600,
    },
  },
});

export const AuthFooter = style({
  padding: `${config.space.S400} 0`,
  marginTop: 'auto',
});

export const AuthAside = style({
  display: 'flex',
  flexGrow: 1,
  alignItems: 'center',
  padding: `${config.space.S600} ${config.space.S400}`,
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
  borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
  '@media': {
    [WIDE]: {
      padding: config.space.S700,
      borderTop: 'none',
      borderLeft: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
    },
  },
});

export const AuthAsideContent = style({
  width: '100%',
  maxWidth: toRem(420),
  margin: '0 auto',
  gap: config.space.S300,
  '@media': {
    [WIDE]: {
      margin: '0 auto 0 0',
      paddingLeft: config.space.S700,
    },
  },
});

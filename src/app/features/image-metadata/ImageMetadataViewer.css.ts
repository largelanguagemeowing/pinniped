import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const Viewer = style([DefaultReset, { height: '100%' }]);

export const Header = style({
  paddingLeft: config.space.S400,
  paddingRight: config.space.S300,
  flexShrink: 0,
});

export const Content = style({
  padding: config.space.S400,
  paddingTop: config.space.S200,
});

export const Notice = style({
  padding: config.space.S300,
  borderRadius: config.radii.R400,
  backgroundColor: color.Warning.Container,
  color: color.Warning.OnContainer,
});

export const Fields = style({
  display: 'grid',
  gridTemplateColumns: `minmax(${toRem(96)}, max-content) minmax(0, 1fr)`,
  columnGap: config.space.S400,
  rowGap: config.space.S200,
  margin: 0,
});

export const Value = style({
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  maxHeight: toRem(200),
  overflowY: 'auto',
  userSelect: 'text',
});

export const Preview = style({
  maxWidth: '100%',
  maxHeight: toRem(240),
  objectFit: 'contain',
  alignSelf: 'flex-start',
  borderRadius: config.radii.R300,
});

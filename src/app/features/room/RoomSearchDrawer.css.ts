import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const RoomSearchDrawer = style({
  width: toRem(266),
  transition: 'width 200ms ease',
});

export const RoomSearchDrawerWide = style({
  width: toRem(450),
});

/** A DM's profile: a wider sidebar, with the same 8px inset as Discord's. */
export const RoomSearchDrawerDirect = style({
  width: toRem(320),
  padding: config.space.S200,
});

export const SearchResultsHeader = style({
  flexShrink: 0,
  alignItems: 'Center',
  justifyContent: 'SpaceBetween',
  padding: `${config.space.S200} ${config.space.S300}`,
  borderBottomWidth: config.borderWidth.B300,
});

export const RoomSearchContentBase = style({
  position: 'relative',
  overflow: 'hidden',
});

export const SearchFilterChips = style({
  flexShrink: 0,
  padding: `${config.space.S200} ${config.space.S300}`,
  borderBottomWidth: config.borderWidth.B300,
});

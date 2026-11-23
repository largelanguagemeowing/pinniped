import { style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
});
export const MessageBody = style({
  transition: 'opacity 200ms ease-out',
});
export const MessageSending = style({
  opacity: config.opacity.Disabled,
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

// time shown in a collapsed row's gutter; Modern and Bubble pin it to the row's left edge across
// the row padding and the 36px avatar column (so a 12h time never wraps), Compact keeps it inline
export const HoverTime = style({
  display: 'flex',
  justifyContent: 'flex-end',
  whiteSpace: 'nowrap',
  position: 'absolute',
  insetInlineStart: 0,
  width: `calc(${config.space.S400} + ${toRem(36)})`,
  selectors: {
    '&[data-compact="true"]': {
      position: 'static',
      width: '100%',
      justifyContent: 'flex-start',
    },
  },
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    WebkitUserSelect: 'none',
    userSelect: 'none',
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

export const MessageStatusSending = style({
  opacity: 0.5,
});

export const MessageFailedBar = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200}`,
    cursor: 'default',
  },
]);

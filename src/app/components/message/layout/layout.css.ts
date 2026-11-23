import { createVar, keyframes, style, styleVariants } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import { inputModeSelector } from '../../../utils/inputMode';

export const StickySection = style({
  position: 'sticky',
  top: config.space.S100,
});

const SpacingVar = createVar();
const SpacingVariant = styleVariants({
  '0': {
    vars: {
      [SpacingVar]: config.space.S0,
    },
  },
  '100': {
    vars: {
      [SpacingVar]: config.space.S100,
    },
  },
  '200': {
    vars: {
      [SpacingVar]: config.space.S200,
    },
  },
  '300': {
    vars: {
      [SpacingVar]: config.space.S300,
    },
  },
  '400': {
    vars: {
      [SpacingVar]: config.space.S400,
    },
  },
  '500': {
    vars: {
      [SpacingVar]: config.space.S500,
    },
  },
});

const highlightAnime = keyframes({
  '0%': {
    backgroundColor: color.Primary.Container,
  },
  '25%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '50%': {
    backgroundColor: color.Primary.Container,
  },
  '75%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '100%': {
    backgroundColor: color.Primary.Container,
  },
});
const HighlightVariant = styleVariants({
  true: {
    animation: `${highlightAnime} 2000ms ease-in-out`,
    animationIterationCount: 'infinite',
  },
});

const SelectedVariant = styleVariants({
  true: {
    backgroundColor: color.Surface.ContainerActive,
  },
});

const AutoCollapse = style({
  selectors: {
    [`&+&`]: {
      marginTop: 0,
    },
  },
});

const MentionedVariant = styleVariants({
  true: {
    backgroundColor: color.Warning.Container,
    boxShadow: `inset ${config.borderWidth.B500} 0 0 ${color.Warning.Main}`,
    selectors: {
      [`${inputModeSelector('keyboard')} &:focus-visible`]: {
        backgroundColor: color.Warning.ContainerHover,
      },
    },
  },
});

export const MessageBase = recipe({
  base: [
    DefaultReset,
    {
      marginTop: SpacingVar,
      WebkitUserSelect: 'text',
      userSelect: 'text',
      padding: `${config.space.S100} ${config.space.S200} ${config.space.S100} ${config.space.S400}`,
      borderRadius: `0 ${config.radii.R400} ${config.radii.R400} 0`,
      selectors: {
        // inset; an outer ring would be clipped by the timeline's scroll edge
        [`${inputModeSelector('keyboard')} &:focus-visible`]: {
          backgroundColor: color.Surface.ContainerHover,
          outlineOffset: toRem(-2),
        },
      },
    },
  ],
  variants: {
    space: SpacingVariant,
    collapse: {
      true: {
        marginTop: 0,
      },
    },
    autoCollapse: {
      true: AutoCollapse,
    },
    // a row you act on; dividers, placeholders and error rows stay inert. Hover needs a pointer,
    // so a mouse left resting on the list after Tab navigation does not tint a second row
    interactive: {
      true: {
        selectors: {
          [`${inputModeSelector('pointer')} &:hover`]: {
            backgroundColor: color.Surface.ContainerHover,
          },
        },
      },
    },
    mentioned: MentionedVariant,
    highlight: HighlightVariant,
    selected: SelectedVariant,
  },
  compoundVariants: [
    {
      variants: { interactive: true, mentioned: true },
      style: {
        selectors: {
          [`${inputModeSelector('pointer')} &:hover`]: {
            backgroundColor: color.Warning.ContainerHover,
          },
        },
      },
    },
  ],
  defaultVariants: {
    space: '400',
  },
});

export type MessageBaseVariants = RecipeVariants<typeof MessageBase>;

export const CompactHeader = style([
  DefaultReset,
  StickySection,
  {
    maxWidth: toRem(170),
    width: '100%',
  },
]);

export const AvatarBase = style({
  WebkitUserSelect: 'none',
  userSelect: 'none',
  paddingTop: toRem(4),
  transition: 'transform 200ms cubic-bezier(0, 0.8, 0.67, 0.97)',
  display: 'flex',
  alignSelf: 'start',

  selectors: {
    '&:hover': {
      transform: `translateY(${toRem(-2)})`,
    },
  },
});

export const ModernBefore = style({
  minWidth: toRem(36),
});

export const BubbleBefore = style({
  minWidth: toRem(36),
});

export const BubbleContent = style({
  maxWidth: toRem(800),
  padding: config.space.S200,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  borderRadius: config.radii.R500,
  position: 'relative',
});

export const BubbleContentArrowLeft = style({
  borderTopLeftRadius: 0,
});

export const BubbleLeftArrow = style({
  width: toRem(9),
  height: toRem(8),

  position: 'absolute',
  top: 0,
  left: toRem(-8),
  zIndex: 1,
});

export const Username = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    'button&:hover, button&:focus-visible': {
      textDecoration: 'underline',
    },
  },
});

/**
 * A username button inside a sentence ("alice invited bob"). `Username` is one truncated line
 * for a message header; here the name is part of running text, so it takes the text's font and
 * colour and wraps with it, however long it is.
 */
export const UsernameInline = style({
  overflow: 'visible',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  maxWidth: '100%',
  verticalAlign: 'baseline',
  textAlign: 'start',
  font: 'inherit',
  color: 'inherit',
  margin: 0,
  padding: 0,
  background: 'none',
  border: 0,
});

export const UsernameBold = style({
  fontWeight: 550,
});

export const MessageTextBody = recipe({
  base: {
    wordBreak: 'break-word',
  },
  variants: {
    preWrap: {
      true: {
        whiteSpace: 'pre-wrap',
      },
    },
    jumboEmoji: {
      true: {
        fontSize: '1.504em',
        lineHeight: '1.4962em',
      },
    },
    emote: {
      true: {
        color: color.Success.Main,
        fontStyle: 'italic',
      },
    },
  },
});

export type MessageTextBodyVariants = RecipeVariants<typeof MessageTextBody>;

import { style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

// Mobile: the nav is the whole page. It renders nothing when a room is open, so
// the wrapper must not keep any width in that case.
export const PageNavWrapper = style({
  selectors: {
    '&:empty': { display: 'none' },
  },
});

export const PageNav = recipe({
  variants: {
    size: {
      '400': {
        width: toRem(256),
      },
      '300': {
        width: toRem(222),
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
});
export type PageNavVariants = RecipeVariants<typeof PageNav>;

export const PageNavHeader = recipe({
  base: {
    padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
    flexShrink: 0,
    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      'button&[aria-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
      'button&:hover, button&:focus-visible': {
        backgroundColor: color.Background.ContainerHover,
      },
      'button&:active': {
        backgroundColor: color.Background.ContainerActive,
      },
    },
  },

  variants: {
    outlined: {
      true: {
        borderBottomWidth: 1,
      },
    },
    /** The height of a room's bar, so the server bar sits level with it. */
    bar: {
      room: {
        height: '42px',
        paddingTop: 0,
        paddingBottom: 0,
      },
    },
  },
  defaultVariants: {
    outlined: true,
    bar: 'room',
  },
});
export type PageNavHeaderVariants = RecipeVariants<typeof PageNavHeader>;

export const PageNavContent = style({
  minHeight: '100%',
  padding: config.space.S200,
  paddingRight: 0,
  paddingBottom: config.space.S700,
});

export const PageHeader = recipe({
  base: {
    paddingLeft: config.space.S400,
    paddingRight: config.space.S200,
  },
  variants: {
    balance: {
      true: {
        paddingLeft: config.space.S200,
      },
    },
    /** Heights of the room bars: a text room's (as Discord's) and a voice room's. */
    bar: {
      room: {
        height: '42px',
        paddingTop: 0,
        paddingBottom: 0,
      },
      call: {
        height: '49px',
        padding: '8px 8px 8px 12px',
      },
    },
    outlined: {
      true: {
        borderBottomWidth: config.borderWidth.B300,
      },
    },
  },
  defaultVariants: {
    outlined: true,
    bar: 'room',
  },
});
export type PageHeaderVariants = RecipeVariants<typeof PageHeader>;

export const PageContent = style([
  DefaultReset,
  {
    paddingTop: config.space.S400,
    paddingLeft: config.space.S400,
    paddingRight: 0,
    paddingBottom: toRem(100),
  },
]);

export const PageHeroEmpty = style([
  DefaultReset,
  {
    padding: config.space.S400,
    borderRadius: config.radii.R400,
    minHeight: toRem(450),
  },
]);

export const PageHeroSection = style([
  DefaultReset,
  {
    padding: '40px 0',
    maxWidth: toRem(466),
    width: '100%',
    margin: 'auto',
  },
]);

export const PageContentCenter = style([
  DefaultReset,
  {
    maxWidth: toRem(964),
    width: '100%',
    margin: 'auto',
  },
]);

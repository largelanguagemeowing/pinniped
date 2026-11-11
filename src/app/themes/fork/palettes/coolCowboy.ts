import type { ForkPalette } from '../derive';

// Source: https://github.com/exdysa/less-vs (MIT), themes/cool-cowboy-theme.json;
// original theme: https://github.com/LRijpkema/cool-cowboy-theme (MIT).
// The theme avoids green by design; blue marks passed/added, so it is the success color.
// No third surface: the next ramp step (#3C3746) is only a border color, so bg2 is derived.
export const coolCowboyPalettes: Record<'cool-cowboy', ForkPalette> = {
  'cool-cowboy': {
    bg0: '#1D1A23', // editor.background
    bg1: '#282430', // editorWidget.background, input.background, menu.background
    accent: '#749392', // button.background
    green: '#8FABC8', // testing.iconPassed, editorGutter.addedBackground
    yellow: '#BFA481', // editorWarning.foreground
    red: '#A25A63', // editorError.foreground
    fg: '#E1DFE5', // editor.foreground
  },
};

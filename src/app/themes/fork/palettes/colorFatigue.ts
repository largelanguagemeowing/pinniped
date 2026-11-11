import type { ForkPalette } from '../derive';

// Source: https://github.com/exdysa/less-vs (MIT), themes/color-fatigue-dark.json;
// original theme: https://github.com/noidilin/vscode-theme-color-fatigue (MIT).
// Neutral grey ramp; the warm grey of links, badges and progress bars is the accent.
export const colorFatiguePalettes: Record<'color-fatigue-dark', ForkPalette> = {
  'color-fatigue-dark': {
    bg0: '#191919', // editor.background
    bg1: '#1E1E1E', // editorWidget.background, input.background
    bg2: '#242424', // list.activeSelectionBackground
    accent: '#8E897D', // textLink.foreground, progressBar.background
    green: '#778777', // gitDecoration.addedResourceForeground
    yellow: '#B09661', // terminal.ansiYellow
    orange: '#C8A492', // editorWarning.foreground
    red: '#B07878', // editorError.foreground
    fg: '#B3B3B3', // editor.foreground
  },
};

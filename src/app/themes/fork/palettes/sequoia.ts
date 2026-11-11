import type { ForkPalette } from '../derive';

// Source: https://github.com/exdysa/less-vs (MIT), themes/sequoia-monochrome.json;
// original theme: https://github.com/Sequoia-Theme/vs-code (MIT).
// Monochrome by design: success, warning and critical are steps of the same
// blue-grey ramp, told apart by lightness only.
export const sequoiaPalettes: Record<'sequoia-monochrome', ForkPalette> = {
  'sequoia-monochrome': {
    bg0: '#0F1014', // editor.background
    bg1: '#111216', // editorWidget.background, menu.background
    bg2: '#131317', // button.secondaryHoverBackground, peekViewTitle.background
    accent: '#B6BAC8', // button.background
    green: '#7C829D', // gitDecoration.addedResourceForeground
    yellow: '#D3D5DE', // editorWarning.foreground
    red: '#999EB2', // editorError.foreground
    fg: '#868690', // editor.foreground
  },
};

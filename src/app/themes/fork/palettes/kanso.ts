import type { ForkPalette } from '../derive';

// Source: https://github.com/exdysa/less-vs (MIT), themes/kanso-ink.json;
// original theme: https://github.com/webhooked/kanso.nvim (MIT), whose
// lua/kanso/themes.lua confirms the roles: diag.error = red, diag.warning = yellow,
// vcs.added = gitGreen. Surfaces are the port's values; kanso.nvim has since moved
// inkBg2/inkBg3 by a shade (#22262D, #393B44).
export const kansoPalettes: Record<'kanso-ink', ForkPalette> = {
  'kanso-ink': {
    bg0: '#14171D', // editor.background (inkBg0)
    bg1: '#24262D', // input.background, menu.background (inkBg2)
    bg2: '#393B42', // editorSuggestWidget.background (inkBg3)
    accent: '#8BA4B0', // list.highlightForeground (blue3)
    green: '#76946A', // editorGutter.addedBackground (gitGreen)
    yellow: '#C4B28A', // terminal.ansiYellow (yellow3)
    orange: '#DCA561', // editorGutter.modifiedBackground (yellow; diag.warning)
    red: '#C34043', // editorGutter.deletedBackground (red; diag.error)
    fg: '#C5C9C7', // editor.foreground
  },
};

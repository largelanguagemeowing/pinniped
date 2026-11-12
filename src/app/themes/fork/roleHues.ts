import type { PureColor, RolePalette } from '../../plugins/roleColor';
import { contrastRatio } from './derive';
import { forkThemeRegistry } from './registry';

/**
 * Official accent colors per theme family, used to tell power-level roles apart.
 * Only themes whose upstream publishes a named accent set are listed; any other
 * theme (custom ones, and monochrome ones whose designer chose not to have hues)
 * gets no role mapping.
 *
 * Names must stay readable on the theme's base background: a color below
 * ROLE_HUE_MIN_CONTRAST there is left out (the upstream value stays listed here).
 */
// WCAG 1.4.11 / large-text level; names are bold.
export const ROLE_HUE_MIN_CONTRAST = 3;
// Fewer hues than this cannot tell roles apart.
const MIN_ROLE_HUES = 3;

// https://github.com/catppuccin/palette (MIT), palette.json, every color flagged `accent`.
const catppuccinFrappe = [
  '#F2D5CF',
  '#EEBEBE',
  '#F4B8E4',
  '#CA9EE6',
  '#E78284',
  '#EA999C',
  '#EF9F76',
  '#E5C890',
  '#A6D189',
  '#81C8BE',
  '#99D1DB',
  '#85C1DC',
  '#8CAAEE',
  '#BABBF1',
];
const catppuccinMacchiato = [
  '#F4DBD6',
  '#F0C6C6',
  '#F5BDE6',
  '#C6A0F6',
  '#ED8796',
  '#EE99A0',
  '#F5A97F',
  '#EED49F',
  '#A6DA95',
  '#8BD5CA',
  '#91D7E3',
  '#7DC4E4',
  '#8AADF4',
  '#B7BDF8',
];
const catppuccinMocha = [
  '#F5E0DC',
  '#F2CDCD',
  '#F5C2E7',
  '#CBA6F7',
  '#F38BA8',
  '#EBA0AC',
  '#FAB387',
  '#F9E2AF',
  '#A6E3A1',
  '#94E2D5',
  '#89DCEB',
  '#74C7EC',
  '#89B4FA',
  '#B4BEFE',
];

// https://github.com/dracula/dracula-theme (MIT), README palette table: cyan, green,
// orange, pink, purple, red, yellow.
const dracula = ['#8BE9FD', '#50FA7B', '#FFB86C', '#FF79C6', '#BD93F9', '#FF5555', '#F1FA8C'];

// https://github.com/ayu-theme/ayu-colors (MIT), themes/{dark,mirage}.yaml `palette`
// without the gray: red, pink, orange, peach, yellow, green, teal, indigo, blue, purple.
const ayuDark = [
  '#F07178',
  '#F29668',
  '#FF8F40',
  '#E6C08A',
  '#FFB454',
  '#AAD94C',
  '#95E6CB',
  '#39BAE6',
  '#59C2FF',
  '#D2A6FF',
];
const ayuMirage = [
  '#F28779',
  '#F29E74',
  '#FFA659',
  '#D9BE98',
  '#FFCD66',
  '#D5FF80',
  '#95E6CB',
  '#5CCFE6',
  '#73D0FF',
  '#DFBFFF',
];

// https://github.com/sainnhe/everforest (MIT), palette.md dark foreground accents
// (shared by hard, medium and soft): red, orange, yellow, green, aqua, blue, purple.
const everforest = ['#E67E80', '#E69875', '#DBBC7F', '#A7C080', '#83C092', '#7FBBB3', '#D699B6'];

// https://github.com/morhetz/gruvbox (MIT/X11), colors/gruvbox.vim bright tier:
// red, green, yellow, blue, purple, aqua, orange.
const gruvbox = ['#FB4934', '#B8BB26', '#FABD2F', '#83A598', '#D3869B', '#8EC07C', '#FE8019'];

// https://github.com/noidilin/vscode-theme-color-fatigue (MIT), README "Saturation" table: the
// normal and bright tier of red, green, yellow, blue, magenta, cyan and orange.
const colorFatigue = [
  '#B07878',
  '#778777',
  '#D6CAAB',
  '#7D96AD',
  '#797994',
  '#769494',
  '#C8A492',
  '#CC9393',
  '#9BB09B',
  '#EBD6B7',
  '#9DB2CF',
  '#9F9FBD',
  '#92B3B3',
  '#DCB5A5',
];

// https://github.com/rebelot/kanagawa.nvim (MIT), lua/kanagawa/colors.lua: the Wave
// syntax accents (oniViolet .. peachRed) and the Dragon family (dragonRed .. dragonPink).
const kanagawaWave = [
  '#957FB8',
  '#7E9CD8',
  '#7FB4CA',
  '#7AA89F',
  '#98BB6C',
  '#E6C384',
  '#FFA066',
  '#D27E99',
  '#E46876',
  '#FF5D62',
];
const kanagawaDragon = [
  '#C4746E',
  '#B6927B',
  '#C4B28A',
  '#87A987',
  '#8EA4A2',
  '#8BA4B0',
  '#949FB5',
  '#8992A7',
  '#A292A3',
];

// https://github.com/webhooked/kanso.nvim (MIT), lua/kanso/colors.lua: the leading
// color of each family (red, yellow, green, blue, violet, pink, orange, aqua).
const kanso = [
  '#C34043',
  '#DCA561',
  '#98BB6C',
  '#7FB4CA',
  '#938AA9',
  '#A292A3',
  '#B6927B',
  '#8EA4A2',
];

// https://github.com/nordtheme/nord (MIT), src/nord.less: nord7 .. nord15.
const nord = [
  '#8FBCBB',
  '#88C0D0',
  '#81A1C1',
  '#5E81AC',
  '#BF616A',
  '#D08770',
  '#EBCB8B',
  '#A3BE8C',
  '#B48EAD',
];

// https://github.com/rose-pine/neovim (MIT), lua/rose-pine/palette.lua: love, gold,
// rose, pine, foam, iris. Main and Moon differ in rose and pine.
const rosePine = ['#EB6F92', '#F6C177', '#EBBCBA', '#31748F', '#9CCFD8', '#C4A7E7'];
const rosePineMoon = ['#EB6F92', '#F6C177', '#EA9A97', '#3E8FB0', '#9CCFD8', '#C4A7E7'];

// https://github.com/folke/tokyonight.nvim (Apache-2.0), lua/tokyonight/colors/*.lua:
// red, orange, yellow, green, teal, cyan, blue, magenta, purple. night inherits storm.
const tokyoNightStorm = [
  '#F7768E',
  '#FF9E64',
  '#E0AF68',
  '#9ECE6A',
  '#1ABC9C',
  '#7DCFFF',
  '#7AA2F7',
  '#BB9AF7',
  '#9D7CD8',
];
const tokyoNightMoon = [
  '#FF757F',
  '#FF966C',
  '#FFC777',
  '#C3E88D',
  '#4FD6BE',
  '#86E1FC',
  '#82AAFF',
  '#C099FF',
  '#FCA7EA',
];

const officialHues: Record<string, readonly string[]> = {
  'ayu-dark': ayuDark,
  'ayu-mirage': ayuMirage,
  'catppuccin-frappe': catppuccinFrappe,
  'catppuccin-macchiato': catppuccinMacchiato,
  'catppuccin-mocha': catppuccinMocha,
  'color-fatigue-dark': colorFatigue,
  dracula,
  'everforest-dark-hard': everforest,
  'everforest-dark-medium': everforest,
  'everforest-dark-soft': everforest,
  'gruvbox-dark-hard': gruvbox,
  'gruvbox-dark-medium': gruvbox,
  'gruvbox-dark-soft': gruvbox,
  'kanagawa-dragon': kanagawaDragon,
  'kanagawa-wave': kanagawaWave,
  'kanso-ink': kanso,
  nord,
  'rose-pine': rosePine,
  'rose-pine-moon': rosePineMoon,
  'tokyo-night-moon': tokyoNightMoon,
  'tokyo-night-night': tokyoNightStorm,
  'tokyo-night-storm': tokyoNightStorm,
};

// Colors a source names red, green, yellow, blue, cyan or magenta itself (only exact names;
// nothing is inferred from how a color looks). A name must also be in the theme's hues.
type Named = Partial<Record<PureColor, string>>;
const everforestNames: Named = {
  red: '#E67E80',
  green: '#A7C080',
  yellow: '#DBBC7F',
  blue: '#7FBBB3',
};
const gruvboxNames: Named = {
  red: '#FB4934',
  green: '#B8BB26',
  yellow: '#FABD2F',
  blue: '#83A598',
};
const tokyoNightStormNames: Named = {
  red: '#F7768E',
  green: '#9ECE6A',
  yellow: '#E0AF68',
  blue: '#7AA2F7',
  cyan: '#7DCFFF',
  magenta: '#BB9AF7',
};
const namedHues: Record<string, Named> = {
  'ayu-dark': { red: '#F07178', green: '#AAD94C', yellow: '#FFB454', blue: '#59C2FF' },
  'ayu-mirage': { red: '#F28779', green: '#D5FF80', yellow: '#FFCD66', blue: '#73D0FF' },
  'catppuccin-frappe': { red: '#E78284', green: '#A6D189', yellow: '#E5C890', blue: '#8CAAEE' },
  'catppuccin-macchiato': { red: '#ED8796', green: '#A6DA95', yellow: '#EED49F', blue: '#8AADF4' },
  'catppuccin-mocha': { red: '#F38BA8', green: '#A6E3A1', yellow: '#F9E2AF', blue: '#89B4FA' },
  'color-fatigue-dark': {
    red: '#B07878',
    green: '#778777',
    yellow: '#D6CAAB',
    blue: '#7D96AD',
    cyan: '#769494',
    magenta: '#797994',
  },
  'everforest-dark-hard': everforestNames,
  'everforest-dark-medium': everforestNames,
  'everforest-dark-soft': everforestNames,
  dracula: { red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C', cyan: '#8BE9FD' },
  'gruvbox-dark-hard': gruvboxNames,
  'gruvbox-dark-medium': gruvboxNames,
  'gruvbox-dark-soft': gruvboxNames,
  'kanso-ink': { red: '#C34043', green: '#98BB6C', yellow: '#DCA561', blue: '#7FB4CA' },
  'tokyo-night-moon': {
    red: '#FF757F',
    green: '#C3E88D',
    yellow: '#FFC777',
    blue: '#82AAFF',
    cyan: '#86E1FC',
    magenta: '#C099FF',
  },
  'tokyo-night-night': tokyoNightStormNames,
  'tokyo-night-storm': tokyoNightStormNames,
};

const palettes = new Map<string, RolePalette>();
forkThemeRegistry.forEach(({ id, palette }) => {
  const readable = (hue: string) => contrastRatio(hue, palette.bg0) >= ROLE_HUE_MIN_CONTRAST;
  const hues = (officialHues[id] ?? []).filter(readable);
  if (hues.length < MIN_ROLE_HUES) return;
  const named = Object.fromEntries(
    Object.entries(namedHues[id] ?? {}).filter(([, hue]) => hues.includes(hue))
  );
  palettes.set(id, { hues, named });
});

/** The role palette of a theme; undefined when it has no official accent set. */
export const getRolePalette = (themeId: string): RolePalette | undefined => palettes.get(themeId);

import type { ForkPalette } from './derive';
import { ayuPalettes } from './palettes/ayu';
import { catppuccinPalettes } from './palettes/catppuccin';
import { catthodePalettes } from './palettes/catthode';
import { colorFatiguePalettes } from './palettes/colorFatigue';
import { coolCowboyPalettes } from './palettes/coolCowboy';
import { draculaPalettes } from './palettes/dracula';
import { everforestPalettes } from './palettes/everforest';
import { gruvboxPalettes } from './palettes/gruvbox';
import { kanagawaPalettes } from './palettes/kanagawa';
import { kansoPalettes } from './palettes/kanso';
import { nordPalettes } from './palettes/nord';
import { oledPalettes } from './palettes/oled';
import { rosePinePalettes } from './palettes/rosePine';
import { sequoiaPalettes } from './palettes/sequoia';
import { tokyoNightPalettes } from './palettes/tokyoNight';

export type ForkThemeMeta = {
  id: string;
  name: string;
  palette: ForkPalette;
};

/**
 * Ordered fork theme registry. IDs are stable once released; entries are
 * appended in the requested family order. All fork themes are dark.
 */
export const forkThemeRegistry: ForkThemeMeta[] = [
  { id: 'ayu-dark', name: 'Ayu Dark', palette: ayuPalettes['ayu-dark'] },
  { id: 'ayu-mirage', name: 'Ayu Mirage', palette: ayuPalettes['ayu-mirage'] },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    palette: catppuccinPalettes['catppuccin-frappe'],
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    palette: catppuccinPalettes['catppuccin-macchiato'],
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    palette: catppuccinPalettes['catppuccin-mocha'],
  },
  { id: 'dracula', name: 'Dracula', palette: draculaPalettes.dracula },
  {
    id: 'everforest-dark-hard',
    name: 'Everforest Dark Hard',
    palette: everforestPalettes['everforest-dark-hard'],
  },
  {
    id: 'everforest-dark-medium',
    name: 'Everforest Dark Medium',
    palette: everforestPalettes['everforest-dark-medium'],
  },
  {
    id: 'everforest-dark-soft',
    name: 'Everforest Dark Soft',
    palette: everforestPalettes['everforest-dark-soft'],
  },
  {
    id: 'gruvbox-dark-hard',
    name: 'Gruvbox Dark Hard',
    palette: gruvboxPalettes['gruvbox-dark-hard'],
  },
  {
    id: 'gruvbox-dark-medium',
    name: 'Gruvbox Dark Medium',
    palette: gruvboxPalettes['gruvbox-dark-medium'],
  },
  {
    id: 'gruvbox-dark-soft',
    name: 'Gruvbox Dark Soft',
    palette: gruvboxPalettes['gruvbox-dark-soft'],
  },
  { id: 'kanagawa-dragon', name: 'Kanagawa Dragon', palette: kanagawaPalettes['kanagawa-dragon'] },
  { id: 'kanagawa-wave', name: 'Kanagawa Wave', palette: kanagawaPalettes['kanagawa-wave'] },
  { id: 'nord', name: 'Nord', palette: nordPalettes.nord },
  { id: 'rose-pine', name: 'Rosé Pine', palette: rosePinePalettes['rose-pine'] },
  { id: 'rose-pine-moon', name: 'Rosé Pine Moon', palette: rosePinePalettes['rose-pine-moon'] },
  {
    id: 'tokyo-night-moon',
    name: 'Tokyo Night Moon',
    palette: tokyoNightPalettes['tokyo-night-moon'],
  },
  {
    id: 'tokyo-night-night',
    name: 'Tokyo Night Night',
    palette: tokyoNightPalettes['tokyo-night-night'],
  },
  {
    id: 'tokyo-night-storm',
    name: 'Tokyo Night Storm',
    palette: tokyoNightPalettes['tokyo-night-storm'],
  },
  { id: 'oled-midnight', name: 'OLED Midnight', palette: oledPalettes['oled-midnight'] },
  { id: 'catthode', name: 'Catthode', palette: catthodePalettes.catthode },
  {
    id: 'color-fatigue-dark',
    name: 'Color Fatigue Dark',
    palette: colorFatiguePalettes['color-fatigue-dark'],
  },
  { id: 'cool-cowboy', name: 'Cool Cowboy', palette: coolCowboyPalettes['cool-cowboy'] },
  { id: 'kanso-ink', name: 'Kanso Ink', palette: kansoPalettes['kanso-ink'] },
  {
    id: 'sequoia-monochrome',
    name: 'Sequoia Monochrome',
    palette: sequoiaPalettes['sequoia-monochrome'],
  },
];

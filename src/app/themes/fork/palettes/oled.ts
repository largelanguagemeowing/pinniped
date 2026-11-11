import type { ForkPalette } from '../derive';

// Pure-black OLED palette: true #000000 base so OLED pixels switch off,
// near-black elevated surfaces, a blue-violet primary and bright status colors.
export const oledPalettes: Record<'oled-midnight', ForkPalette> = {
  'oled-midnight': {
    bg0: '#000000', // Midnight base
    bg1: '#0A0A0B', // panels / sidebars
    bg2: '#141416', // inputs / menus
    accent: '#7983F5', // blurple tinted for contrast on black
    green: '#23A55A',
    yellow: '#F0B232',
    orange: '#F0B232',
    red: '#F23F42',
    fg: '#F2F3F5',
  },
};

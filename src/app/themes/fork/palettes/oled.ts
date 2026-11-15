import type { ForkPalette } from '../derive';

// Pure-black OLED palette: true #000000 base so OLED pixels switch off, near-black
// elevated surfaces, and the 400 tier of Tailwind CSS v3 colors (MIT), which is bright
// enough on black without glaring. Neutral text, a blue primary.
export const oledPalettes: Record<'oled-midnight', ForkPalette> = {
  'oled-midnight': {
    bg0: '#000000', // Midnight base
    bg1: '#0B0B0D', // panels / sidebars
    bg2: '#161619', // inputs / menus
    accent: '#60A5FA', // blue-400
    green: '#4ADE80', // green-400
    yellow: '#FACC15', // yellow-400
    orange: '#FB923C', // orange-400
    red: '#F87171', // red-400
    fg: '#EDEDF0',
  },
};

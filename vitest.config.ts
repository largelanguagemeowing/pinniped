import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          exclude: ['tests/unit/call-engine/**'],
        },
      },
      {
        // The call core runs against LiveKit and WebRTC types that need a DOM.
        extends: true,
        test: {
          name: 'call-engine',
          environment: 'jsdom',
          include: ['tests/unit/call-engine/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/unit/call-engine/setup.ts'],
        },
      },
    ],
  },
});

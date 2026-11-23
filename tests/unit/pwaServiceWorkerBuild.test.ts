import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// patches/vite-plugin-pwa+2.0.0.patch; the plugin builds the service worker with the option
// Rolldown deprecated, which prints a warning on every build
describe('vite-plugin-pwa service worker build', () => {
  const dist = join(
    dirname(createRequire(import.meta.url).resolve('vite-plugin-pwa/package.json')),
    'dist'
  );

  it.each(['index.cjs', 'vite-build-BGK4YAIU.js'])(
    '%s does not use inlineDynamicImports',
    (file) => {
      const source = readFileSync(join(dist, file), 'utf8');
      expect(source).not.toContain('inlineDynamicImports');
      expect(source).toContain('codeSplitting: false');
    }
  );
});

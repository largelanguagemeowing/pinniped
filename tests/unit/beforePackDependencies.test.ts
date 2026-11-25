import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { describe, expect, it } from 'vitest';

// The hook runs from the checkout's node_modules; a package only another one pulls in is
// missing as soon as that one stops doing so
describe('electron-builder beforePack hook', () => {
  it('declares every package it requires', () => {
    const source = readFileSync('scripts/fork/electron/before-pack.cjs', 'utf8');
    const required = [...source.matchAll(/require\('([^'.][^']*)'\)/g)]
      .map(([, name]) => name)
      .filter((name) => !builtinModules.includes(name));
    const { dependencies = {}, devDependencies = {} } = JSON.parse(
      readFileSync('package.json', 'utf8')
    );

    expect(required).toContain('esbuild');
    required.forEach((name) =>
      expect({ ...dependencies, ...devDependencies }).toHaveProperty([name])
    );
  });
});

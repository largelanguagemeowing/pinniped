import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app version comes from package.json at build time, so the script has nothing else to edit
describe('scripts/update-version.js', () => {
  it('bumps package.json and leaves the sources alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'update-version-'));
    mkdirSync(join(root, 'scripts'));
    copyFileSync('scripts/update-version.js', join(root, 'scripts', 'update-version.js'));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', version: '1.0.0', type: 'module' })
    );
    mkdirSync(join(root, 'src/app/pages/auth'), { recursive: true });
    const source = join(root, 'src/app/pages/auth/AuthFooter.tsx');
    writeFileSync(source, 'export const v = `v${VERSION}`;\n');

    const run = spawnSync('node', [join(root, 'scripts', 'update-version.js'), '2.3.4'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('2.3.4');
    expect(run.stdout).not.toContain('AuthFooter');
  });
});

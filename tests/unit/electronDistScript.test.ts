import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hasZip = spawnSync('zip', ['-v']).status === 0 && spawnSync('unzip', ['-v']).status === 0;

// A checkout at `<home>/<checkoutName>` with the script, and an Electron cache in `<home>/cache`
const setup = (checkoutName: string) => {
  const home = mkdtempSync(join(tmpdir(), 'electron-dist-'));
  const checkout = join(home, checkoutName);
  const dir = join(checkout, 'scripts', 'fork', 'electron');
  mkdirSync(dir, { recursive: true });
  copyFileSync('scripts/fork/electron/electron-dist.mjs', join(dir, 'electron-dist.mjs'));
  writeFileSync(
    join(checkout, 'package.json'),
    JSON.stringify({ devDependencies: { electron: '1.2.3' } })
  );
  mkdirSync(join(home, 'cache'));
  const env = { ...process.env, HOME: home, ELECTRON_CACHE: join(home, 'cache') };
  return { home, script: join(dir, 'electron-dist.mjs'), env };
};

describe('scripts/fork/electron/electron-dist.mjs', () => {
  it('runs from a checkout whose path needs URL escaping', () => {
    const { script, env } = setup('my checkout');
    const run = spawnSync('node', [script], { encoding: 'utf8', env });

    // No cached archive: it prints nothing and electron-builder downloads as usual
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
  });

  it.skipIf(!hasZip)('lets builds that start together unpack the same archive', async () => {
    const { home, script, env } = setup('checkout');
    const files = mkdtempSync(join(tmpdir(), 'electron-files-'));
    writeFileSync(join(files, 'electron'), 'binary');
    for (let i = 0; i < 300; i += 1) writeFileSync(join(files, `file${i}`), `${i}`);
    execFileSync('zip', ['-q', '-r', join(home, 'cache', 'electron-v1.2.3-linux-x64.zip'), '.'], {
      cwd: files,
    });

    const runs = Array.from(
      { length: 6 },
      () =>
        new Promise<{ status: number | null; stdout: string }>((resolve) => {
          const child = spawn('node', [script], { env });
          let stdout = '';
          child.stdout.on('data', (chunk) => {
            stdout += chunk;
          });
          child.on('close', (status) => resolve({ status, stdout }));
        })
    );
    const results = await Promise.all(runs);

    const target = join(home, '.cache', 'electron-unpacked', '1.2.3');
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(0));
    expect(results.map((r) => r.stdout)).toEqual(Array(6).fill(`-c.electronDist=${target}`));
    expect(existsSync(join(target, 'electron'))).toBe(true);
  });
});

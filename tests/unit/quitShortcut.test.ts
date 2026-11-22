import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { readEnabled, writeEnabled } = createRequire(import.meta.url)(
  '../../electron/quit-shortcut.cjs'
) as {
  readEnabled: (dir: string) => boolean;
  writeEnabled: (dir: string, enabled: boolean) => void;
};

describe('quit shortcut preference', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pinniped-quit-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is off when nothing was saved', () => {
    expect(readEnabled(dir)).toBe(false);
    expect(readEnabled(join(dir, 'missing'))).toBe(false);
  });

  it('keeps what was saved', () => {
    writeEnabled(dir, true);
    expect(readEnabled(dir)).toBe(true);
    writeEnabled(dir, false);
    expect(readEnabled(dir)).toBe(false);
  });

  it('creates the folder and saves only a real true', () => {
    const nested = join(dir, 'a', 'b');
    writeEnabled(nested, 'yes' as unknown as boolean);
    expect(JSON.parse(readFileSync(join(nested, 'quit-shortcut.json'), 'utf8'))).toEqual({
      enabled: false,
    });
  });

  it('is off when the file is damaged or says something else', () => {
    writeFileSync(join(dir, 'quit-shortcut.json'), '{not json');
    expect(readEnabled(dir)).toBe(false);
    writeFileSync(join(dir, 'quit-shortcut.json'), JSON.stringify({ enabled: 'true' }));
    expect(readEnabled(dir)).toBe(false);
  });
});

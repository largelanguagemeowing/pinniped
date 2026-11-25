import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

// Linux only: the stand-in helper is a shell script.
describe.skipIf(process.platform !== 'linux')('the desktop helper client', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** The client, started on a helper that says it is ready and then stops reading its input. */
  const deafHelperClient = () => {
    dir = mkdtempSync(join(tmpdir(), 'pinniped-helper-'));
    const exe = join(dir, 'pinniped-helper');
    writeFileSync(
      exe,
      '#!/bin/sh\necho \'{"event":"ready","app_id":true,"shortcuts":true}\'\nexec 0<&-\nexec sleep 30\n'
    );
    chmodSync(exe, 0o755);
    const nodeRequire = createRequire(import.meta.url);
    const module = { exports: {} as { helper: Helper } };
    runInNewContext(readFileSync(new URL('../../electron/helper.cjs', import.meta.url), 'utf8'), {
      module,
      __dirname: dir,
      process: { platform: 'linux', env: {}, resourcesPath: dir },
      Buffer,
      setTimeout,
      require: (name: string) =>
        name === 'electron' ? { app: { isPackaged: true } } : nodeRequire(name),
    });
    return module.exports.helper;
  };

  type Helper = {
    request: (command: object) => Promise<{ ok: boolean; error?: string }>;
    stop: () => void;
  };

  it('answers a command the helper cannot receive instead of crashing the main process', async () => {
    const helper = deafHelperClient();
    // wait until the script has closed its stdin
    await helper.request({ cmd: 'shortcuts', shortcuts: [] }).catch(() => undefined);
    const result = await helper.request({ cmd: 'shortcuts', shortcuts: [] });
    expect(result.ok).toBe(false);
    helper.stop();
  });
});

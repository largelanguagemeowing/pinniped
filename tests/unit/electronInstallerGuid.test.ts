import { readFileSync } from 'node:fs';
import { UUID } from 'builder-util-runtime';
import { describe, expect, it } from 'vitest';

// electron-builder's NSIS namespace (app-builder-lib targets/nsis/NsisTarget.js)
const NSIS_NS = UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3');

describe('Windows installer registry key', () => {
  it('is the GUID electron-builder derived for the app id, so an install takes over the NSIS entry', () => {
    const appId = /^appId:\s*(\S+)/m.exec(
      readFileSync('electron/electron-builder.yml', 'utf8')
    )?.[1];
    const guid = /UNINSTALL_GUID: &str = "([^"]+)"/.exec(
      readFileSync('electron/installer/src/config.rs', 'utf8')
    )?.[1];
    expect(appId).toBeTruthy();
    expect(guid).toBe(UUID.v5(appId as string, NSIS_NS));
  });
});

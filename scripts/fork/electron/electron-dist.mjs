#!/usr/bin/env node
/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Prints an electron-builder `-c.electronDist=<dir>` flag for the Electron version in
// package.json, unpacking a Linux archive already in the Electron cache. electron-builder
// otherwise asks GitHub for the release checksums on every build, even with the archive cached,
// so a GitHub 504 fails the build. Prints nothing when there's no cached archive (the normal
// download then runs).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../..', import.meta.url).pathname;
const { devDependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = devDependencies.electron;
const archiveName = `electron-v${version}-linux-x64.zip`;

const cacheRoot = process.env.ELECTRON_CACHE ?? join(homedir(), '.cache', 'electron');

const findArchive = (dir) => {
  if (!existsSync(dir)) return undefined;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === archiveName) return path;
    if (entry.isDirectory()) {
      const found = findArchive(path);
      if (found) return found;
    }
  }
  return undefined;
};

const archive = findArchive(cacheRoot);
if (!archive) process.exit(0);

const target = join(homedir(), '.cache', 'electron-unpacked', version);
if (!existsSync(join(target, 'electron'))) {
  // Unpack beside the target and rename, so an interrupted unpack never looks complete.
  const staging = `${target}.partial`;
  rmSync(staging, { recursive: true, force: true });
  const result = spawnSync('unzip', ['-q', archive, '-d', staging], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (result.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    process.exit(0);
  }
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
}

process.stdout.write(`-c.electronDist=${target}`);

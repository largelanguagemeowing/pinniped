import fs from 'node:fs';
import path from 'node:path';
import { buildElementCallFork, elementCallForkStale } from './build.mjs';

// Returns the directory holding the built Element Call widget (the fork vendored in
// element-call/). ELEMENT_CALL_FORK_DIST points at a prebuilt one (the Dockerfile and
// Nix build it separately); otherwise it lives in node_modules/.cache and is rebuilt
// whenever element-call/ changes, unless ELEMENT_CALL_FORK_REBUILD=0.
export function prepareElementCall() {
  const fork = path.resolve(
    process.env.ELEMENT_CALL_FORK_DIST ?? 'node_modules/.cache/pinniped-element-call'
  );
  if (process.env.ELEMENT_CALL_FORK_REBUILD !== '0' && elementCallForkStale(fork)) {
    buildElementCallFork(fork);
  }
  if (!fs.existsSync(path.join(fork, 'index.html'))) {
    throw new Error(
      `Element Call has not been built at ${fork}. Run \`npm run build:element-call\`.`
    );
  }
  return fork;
}

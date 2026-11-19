// Mounts the real CallStage (container, measuring, Grid, layouts and tiles) around a fake call.
// Driven by run.mjs, which resizes a real Chromium window and measures the tiles.
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { type MatrixClient } from 'matrix-js-sdk';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../../src/index.css';
import { configClass, varsClass } from 'folds';

import { CallStage } from '../../src/app/features/call/stage';
import { MatrixClientProvider } from '../../src/app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../../src/app/hooks/useSpecVersions';
import { DarkTheme } from '../../src/app/hooks/useTheme';
import { fakeCall } from './fakeCall';

const params = new URLSearchParams(location.search);
const call = fakeCall({
  layout: params.get('layout') ?? 'grid',
  tiles: Number(params.get('tiles') ?? 4),
  shares: Number(params.get('shares') ?? 0),
  indicators: params.get('indicators') === '1',
  rich: params.get('rich') === '1',
  reconnecting: params.get('reconnecting') === '1',
});

document.body.classList.add(configClass, varsClass, ...DarkTheme.classNames);

const streamHeights: (number | null)[] = [];
(window as unknown as { __streamHeights: (number | null)[] }).__streamHeights = streamHeights;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MatrixClientProvider value={{} as MatrixClient}>
      <SpecVersionsProvider value={{ versions: ['v1.11'] }}>
        <CallStage
          call={call}
          idle={params.get('idle') === '1'}
          onMemberMenu={(userId, anchor) => console.info('member menu', userId, anchor)}
          onStreamHeightChange={(height) => streamHeights.push(height)}
        />
      </SpecVersionsProvider>
    </MatrixClientProvider>
  </StrictMode>
);

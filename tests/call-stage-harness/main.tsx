// Mounts the real CallStage (container, measuring, Grid, layouts and tiles) around a fake call.
// Driven by run.mjs, which resizes a real Chromium window and measures the tiles.
import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { type MatrixClient } from 'matrix-js-sdk';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../../src/index.css';
import { configClass, varsClass } from 'folds';

import { CallStage } from '../../src/app/features/call/stage';
import { DmCallSplit } from '../../src/app/features/room/DmCallSplit';
import { MatrixClientProvider } from '../../src/app/hooks/useMatrixClient';
import { SpecVersionsProvider } from '../../src/app/hooks/useSpecVersions';
import { DarkTheme } from '../../src/app/hooks/useTheme';
import { CallPictureInPicture } from '../../src/app/features/call-pip';
import { fakeCall } from './fakeCall';

const params = new URLSearchParams(location.search);
const call = fakeCall({
  layout: params.get('layout') ?? 'grid',
  tiles: Number(params.get('tiles') ?? 4),
  shares: Number(params.get('shares') ?? 0),
  indicators: params.get('indicators') === '1',
  rich: params.get('rich') === '1',
  everyoneSpeaks: params.get('everyoneSpeaks') === '1',
  reconnecting: params.get('reconnecting') === '1',
  flapCamera: Number(params.get('flapCamera') ?? 0),
  repeatCamera: Number(params.get('repeatCamera') ?? 0),
  undecryptable: (params.get('undecryptable') ?? '').split(',').filter(Boolean).map(Number),
});

document.body.classList.add(configClass, varsClass, ...DarkTheme.classNames);

const streamHeights: (number | null)[] = [];
(window as unknown as { __streamHeights: (number | null)[] }).__streamHeights = streamHeights;

const stage = (
  <CallStage
    call={call}
    idle={params.get('idle') === '1'}
    onMemberMenu={(userId, anchor) => console.info('member menu', userId, anchor)}
    onStreamHeightChange={(height) => streamHeights.push(height)}
  />
);

/** The call above the chat with the draggable divider between them, as in a DM. */
function Split() {
  const [callOnly, setCallOnly] = useState(params.get('callOnly') === '1');
  // run.mjs switches to call-only (the call fullscreened) and back.
  useEffect(() => {
    (window as unknown as { __setCallOnly: typeof setCallOnly }).__setCallOnly = setCallOnly;
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <DmCallSplit
        call={stage}
        chat={<div data-harness-chat style={{ flexGrow: 1, background: '#222' }} />}
        callOnly={callOnly}
      />
    </div>
  );
}

function Location() {
  return <div data-harness-location>{useLocation().pathname}</div>;
}

/** The floating call window over a stand-in for the rest of the app; `stage=1` also opens the call view. */
function PipPage() {
  return (
    <>
      <Location />
      <div style={{ height: '100%', background: '#181818' }}>
        {params.get('stage') === '1' && stage}
      </div>
      <CallPictureInPicture call={call} />
    </>
  );
}

// useRoomNavigate reads the route, which needs a data router.
const pipRouter = createMemoryRouter([{ path: '*', element: <PipPage /> }]);

const client = { getRoom: () => null } as unknown as MatrixClient;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MatrixClientProvider value={client}>
      <SpecVersionsProvider value={{ versions: ['v1.11'] }}>
        {params.get('pip') === '1' && <RouterProvider router={pipRouter} />}
        {params.get('pip') !== '1' && (params.get('split') === '1' ? <Split /> : stage)}
      </SpecVersionsProvider>
    </MatrixClientProvider>
  </StrictMode>
);

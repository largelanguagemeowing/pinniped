import { expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { type LocalAudioTrack } from 'livekit-client';
import { logger } from 'matrix-js-sdk/lib/logger';

import { captureConstraintsSync } from '../../../../src/app/plugins/call/engine/livekit/captureConstraints';
import { ObservableScope } from '../../../../src/app/plugins/call/engine/state/ObservableScope';
import { appStore } from '../../../../src/app/state/appStore';
import { settingsAtom } from '../../../../src/app/state/settings';

const change = (patch: { callAutoGain?: boolean; callEchoCancellation?: boolean }) =>
  appStore.set(settingsAtom, { ...appStore.get(settingsAtom), ...patch });

it('has echo cancellation off by default and re-constrains the live track as settings change', () => {
  expect(appStore.get(settingsAtom).callEchoCancellation).toBe(false);

  const applyConstraints = vi.fn(async () => undefined);
  const track = { mediaStreamTrack: { applyConstraints } } as unknown as LocalAudioTrack;
  const scope = new ObservableScope();
  captureConstraintsSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
  expect(applyConstraints).toHaveBeenLastCalledWith({
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
  });

  // each change carries the other setting too: applyConstraints replaces the whole set
  change({ callEchoCancellation: true });
  expect(applyConstraints).toHaveBeenLastCalledWith({
    autoGainControl: false,
    echoCancellation: true,
    noiseSuppression: false,
  });
  change({ callAutoGain: true });
  expect(applyConstraints).toHaveBeenLastCalledWith({
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: false,
  });
  change({ callAutoGain: false, callEchoCancellation: false });
  scope.end();
});

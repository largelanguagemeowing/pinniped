/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalAudioTrack } from 'livekit-client';
import { type Logger } from 'matrix-js-sdk/lib/logger';
import { combineLatest } from 'rxjs';

import { callSettings } from '../settings';
import { type Behavior } from '../state/Behavior';
import { type ObservableScope } from '../state/ObservableScope';

/**
 * Keeps the browser's own processing of the microphone capture (automatic gain,
 * echo cancellation) in step with the settings. The mic is opened with the same
 * values (see ConnectionFactory); a change re-constrains the live track, so no
 * re-capture is needed and the level is corrected before the voice gate hears
 * the signal. `applyConstraints` replaces the whole constraint set, so every
 * processing constraint is sent together; noise suppression is never wanted.
 */
export function captureConstraintsSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  combineLatest([audioTrack$, callSettings.autoGain$, callSettings.echoCancellation$])
    .pipe(scope.bind())
    .subscribe(([track, autoGainControl, echoCancellation]) => {
      if (track === null) return;
      track.mediaStreamTrack
        .applyConstraints({ autoGainControl, echoCancellation, noiseSuppression: false })
        .catch((e) => logger.warn('Failed to set microphone processing', e));
    });
}

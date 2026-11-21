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
 * Keeps the browser's automatic gain control on the microphone capture in step
 * with the setting. The mic is always opened with it off (see ConnectionFactory);
 * turning it on re-constrains the live track, so no re-capture is needed and the
 * level is corrected before the voice gate hears the signal.
 */
export function autoGainSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  combineLatest([audioTrack$, callSettings.autoGain$])
    .pipe(scope.bind())
    .subscribe(([track, enabled]) => {
      if (track === null) return;
      track.mediaStreamTrack
        .applyConstraints({ autoGainControl: enabled })
        .catch((e) => logger.warn('Failed to set microphone auto gain', e));
    });
}

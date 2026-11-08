/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useEffect } from "react";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { playCallSound } from "../livekit/callSounds";

/** Reports the call's sound moments to the client, which plays them. */
export function CallEventAudioRenderer({
  vm,
}: {
  vm: CallViewModel;
}): ReactNode {
  useEffect(() => {
    const subs = [
      vm.joinSoundEffect$.subscribe(() => playCallSound("join")),
      vm.leaveSoundEffect$.subscribe(() => playCallSound("left")),
      vm.newHandRaised$.subscribe(() => playCallSound("raiseHand")),
      vm.newScreenShare$.subscribe(() => playCallSound("screenshareStarted")),
    ];
    return (): void => subs.forEach((sub) => sub.unsubscribe());
  }, [vm]);

  return <></>;
}

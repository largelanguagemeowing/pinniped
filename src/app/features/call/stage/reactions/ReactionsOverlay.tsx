/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from 'react';

import { type CallViewModel } from '../../../../plugins/call/engine/state/CallViewModel/CallViewModel';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import * as css from './ReactionsOverlay.css';

/** Incoming reactions, floating up across the call view. */
export function ReactionsOverlay({ vm }: { vm: CallViewModel }) {
  const reactions = useBehavior(vm.visibleReactions$);
  return (
    <div className={css.container}>
      {reactions.map(({ sender, emoji, startX }) => (
        <span
          // Reactions effects are presentation; the reaction is also shown on the sender's tile,
          // which assistive technology can read from instead.
          role="presentation"
          style={{ left: `${startX}%` }}
          className={css.reaction}
          // A sender can only send one emoji at a time.
          key={sender}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

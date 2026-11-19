/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from 'react';
import classNames from 'classnames';

import * as css from './ReactionIndicator.css';

/** A participant's reaction (or raised hand) as a badge on their tile. */
export function ReactionIndicator({ emoji, miniature }: { emoji: string; miniature?: boolean }) {
  return (
    <div className={css.widget}>
      <div className={classNames(css.reaction, { [css.reactionLarge]: !miniature })}>
        <span className={css.emoji} role="img" aria-label="Reaction">
          {emoji}
        </span>
      </div>
    </div>
  );
}

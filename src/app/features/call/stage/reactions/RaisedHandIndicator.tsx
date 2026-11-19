/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from 'react';

import { ReactionIndicator } from './ReactionIndicator';

/** A raised hand on a participant's tile; nothing while the hand is down. */
export function RaisedHandIndicator({
  raisedHandTime,
  miniature,
}: {
  raisedHandTime?: Date;
  miniature?: boolean;
}) {
  if (!raisedHandTime) return null;
  return <ReactionIndicator emoji="✋" miniature={miniature} />;
}

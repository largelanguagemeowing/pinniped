/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, type MouseEvent, use } from 'react';
import { type RectCords } from 'folds';

import { constant, type Behavior } from '../../../plugins/call/engine/state/Behavior';
import { useBehavior } from '../../../plugins/call/engine/useBehavior';
import { type ScreenShareViewModel } from '../../../plugins/call/engine/state/media/ScreenShareViewModel';

/** What tiles and layouts can do in the call view, provided by CallStage. */
export interface Stage {
  /** Puts a participant or screen share in the spotlight, or back to automatic if it is there. */
  focusMedia: (mediaId: string) => void;
  /** Clears any focus and switches to the grid. */
  showGrid: () => void;
  /** All screen shares, so the strip keeps their previews while someone else is focused. */
  screenShares$: Behavior<ScreenShareViewModel[]>;
  /** Opens Pinniped's participant menu for a Matrix user at an anchor. */
  openMemberMenu: (userId: string, anchor: RectCords) => void;
  /** Reports the height of the screen share shown in the spotlight, or null when there is none. */
  reportStreamHeight: (height: number | null) => void;
  /** Remote participants, by LiveKit identity, whose media cannot be decrypted. */
  undecryptable$: Behavior<ReadonlySet<string>>;
}

export const StageContext = createContext<Stage | null>(null);

const noScreenShares = constant<ScreenShareViewModel[]>([]);

/** Every screen share in the call; none outside a stage. */
export const useStageScreenShares$ = (): Behavior<ScreenShareViewModel[]> =>
  use(StageContext)?.screenShares$ ?? noScreenShares;

const noneUndecryptable = constant<ReadonlySet<string>>(new Set());

/** Whether the media of the participant with this LiveKit identity cannot be decrypted. */
export const useUndecryptable = (identity: string): boolean =>
  useBehavior(use(StageContext)?.undecryptable$ ?? noneUndecryptable).has(identity);

/** Clicks on a tile's own controls (menus, buttons) shouldn't change focus. */
export const isTileBodyClick = (e: MouseEvent): boolean =>
  !(e.target as Element).closest("button, a, input, [role='menu']");

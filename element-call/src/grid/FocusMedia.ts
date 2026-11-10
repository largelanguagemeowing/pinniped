/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, type MouseEvent } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../state/Behavior";
import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { ElementWidgetActions, widget } from "../widget";

/**
 * Pinniped: "click a tile to focus it". Provided by InCallView so tiles
 * and layouts can reach the call view model.
 */
export interface FocusMedia {
  focusMedia: (mediaId: string) => void;
  showGrid: () => void;
  /** All screen shares, so the strip keeps their previews while someone else is focused. */
  screenShares$: Behavior<ScreenShareViewModel[]>;
}

export const FocusMediaContext = createContext<FocusMedia | null>(null);

/** Clicks on a tile's own controls (menus, buttons) shouldn't change focus. */
export const isTileBodyClick = (e: MouseEvent): boolean =>
  !(e.target as Element).closest("button, a, input, [role='menu']");

/**
 * Pinniped: asks the embedding client to open its profile card for a participant
 * (the tile menu's "View Profile").
 */
export const viewProfileInHost = (userId: string): void => {
  widget?.api.transport
    .send(ElementWidgetActions.ViewProfile, { userId })
    .catch((e) => logger.warn("Could not ask the client to show a profile", e));
};

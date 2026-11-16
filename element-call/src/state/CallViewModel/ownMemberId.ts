/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { v4 as uuidv4 } from "uuid";

import { MatrixRTCMode } from "../../settings/settings";

/**
 * The member ID we announce for ourselves: in key messages, and to the JWT
 * service for the hashed backend identity. Other clients derive the member ID of
 * a legacy membership event as `userId:deviceId` since the event carries none,
 * so a random ID would never match it. Only sticky events carry the ID.
 */
export function ownMemberId(
  mode: MatrixRTCMode,
  userId: string,
  deviceId: string,
): string {
  return mode === MatrixRTCMode.Matrix_2_0 ? uuidv4() : `${userId}:${deviceId}`;
}

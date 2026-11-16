/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The LiveKit participant attribute that says a client rejoins the call by itself when the
 * SFU drops it. The SFU's drain only deletes rooms whose participants all carry it.
 * Client-reported: it steers a drain, it is not a security boundary.
 */
export const REJOIN_ATTRIBUTE = "club.stablecat.pinniped.rejoin";
export const REJOIN_ATTRIBUTE_VALUE = "1";

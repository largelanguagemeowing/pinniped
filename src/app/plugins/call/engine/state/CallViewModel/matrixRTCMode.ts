/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export enum MatrixRTCMode {
  Legacy = 'legacy',
  Compatibility = 'compatibility',
  /** This implies using
   *  - sticky events
   *  - hashed RTC backend identity
   *  - the new endpoint for the jwt token on the local membership (remote memberships will always try the new jwt endpoint first -> then the legacy one)
   *  - use the hashed identity for the local membership
   */
  Matrix_2_0 = 'matrix_2_0',
}

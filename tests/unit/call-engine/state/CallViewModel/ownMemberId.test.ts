/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from 'vitest';

import { MatrixRTCMode } from '../../../../../src/app/plugins/call/engine/state/CallViewModel/matrixRTCMode';
import { ownMemberId } from '../../../../../src/app/plugins/call/engine/state/CallViewModel/ownMemberId';

describe('ownMemberId', () => {
  test('matches the ID other clients derive for legacy membership events', () => {
    for (const mode of [MatrixRTCMode.Legacy, MatrixRTCMode.Compatibility]) {
      expect(ownMemberId(mode, '@a:x', 'DEV')).toBe('@a:x:DEV');
    }
  });

  test('is a fresh unique ID for sticky events', () => {
    const a = ownMemberId(MatrixRTCMode.Matrix_2_0, '@a:x', 'DEV');
    const b = ownMemberId(MatrixRTCMode.Matrix_2_0, '@a:x', 'DEV');
    expect(a).not.toBe('@a:x:DEV');
    expect(a).not.toBe(b);
  });
});

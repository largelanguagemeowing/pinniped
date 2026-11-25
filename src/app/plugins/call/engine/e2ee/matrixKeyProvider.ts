/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from 'livekit-client';
import { type MatrixRTCSession, MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc';
import { logger as rootLogger } from 'matrix-js-sdk/lib/logger';
import { watchKeyMessages } from './keyMessages';
import { type CallMembershipIdentityParts } from 'matrix-js-sdk/lib/matrixrtc/EncryptionManager';
const logger = rootLogger.getChild('[MatrixKeyProvider]');

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;
  private stopKeyMessageLog?: () => void;

  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  public setRTCSession(rtcSession: MatrixRTCSession): void {
    this.stopListening();

    this.rtcSession = rtcSession;
    this.stopKeyMessageLog = watchKeyMessages(rtcSession);

    this.rtcSession.on(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onEncryptionKeyChanged);

    // The new session could be aware of keys of which the old session wasn't,
    // so emit key changed events
    this.rtcSession.reemitEncryptionKeys();
  }

  /**
   * Stops listening to the session and the client. The room keeps one session for every call
   * in it, so listeners left behind would feed keys to this provider in the calls that follow.
   */
  public dispose(): void {
    this.stopListening();
    this.rtcSession = undefined;
  }

  private stopListening(): void {
    this.rtcSession?.off(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onEncryptionKeyChanged);
    this.stopKeyMessageLog?.();
    this.stopKeyMessageLog = undefined;
  }

  private onEncryptionKeyChanged = (
    encryptionKey: Uint8Array<ArrayBuffer>,
    encryptionKeyIndex: number,
    membershipParts: CallMembershipIdentityParts,
    rtcBackendIdentity: string
  ): void => {
    crypto.subtle.importKey('raw', encryptionKey, 'HKDF', false, ['deriveBits', 'deriveKey']).then(
      (keyMaterial) => {
        this.onSetEncryptionKey(keyMaterial, rtcBackendIdentity, encryptionKeyIndex);

        logger.debug(
          `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${rtcBackendIdentity} (before hash: ${membershipParts.userId}:${membershipParts.deviceId}) encryptionKeyIndex=${encryptionKeyIndex}`
        );
      },
      (e) => {
        logger.error(
          `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId before hash=${membershipParts.userId}:${membershipParts.deviceId} encryptionKeyIndex=${encryptionKeyIndex}`,
          e
        );
      }
    );
  };
}

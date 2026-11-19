/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ClientEvent, EventType, type MatrixEvent } from 'matrix-js-sdk';
import { type MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc';
import { logger as rootLogger } from 'matrix-js-sdk/lib/logger';

const logger = rootLogger.getChild('[KeyMessages]');

interface KeyContent {
  member_id?: unknown;
  member?: { id?: unknown; claimed_device_id?: unknown };
}

interface MembershipIdentity {
  userId: string;
  deviceId: string;
  memberId: string;
}

/**
 * The member ID a key message should carry, or undefined to leave it alone.
 *
 * Before matrix-js-sdk 45 a key was matched to a membership by user and device
 * only; clients of that era put a random member ID in the key message that no
 * membership event ever carries, which the current SDK (it also compares member
 * IDs) would never match. When the claimed ID matches none of the sender's
 * memberships on that device and there is exactly one such membership, that
 * membership's ID is meant.
 */
export function resolveKeyMemberId(
  sender: string,
  content: KeyContent,
  memberships: readonly MembershipIdentity[]
): string | undefined {
  const deviceId = content.member?.claimed_device_id;
  if (typeof deviceId !== 'string') return undefined;
  const claimed = content.member_id ?? content.member?.id;
  const onDevice = memberships.filter((m) => m.userId === sender && m.deviceId === deviceId);
  if (onDevice.length !== 1 || onDevice.some((m) => m.memberId === claimed)) return undefined;
  return onDevice[0].memberId;
}

/**
 * Watches the call key messages we receive: logs their identity fields next to
 * the session's memberships (never the key), and fixes up the member ID of keys
 * from older clients (see {@link resolveKeyMemberId}). The listener runs before
 * the SDK's own, which reads the content afterwards. Returns the unsubscribe.
 */
export function watchKeyMessages(rtcSession: MatrixRTCSession): () => void {
  const client = rtcSession.room.client;
  const onToDevice = (event: MatrixEvent): void => {
    const sender = event.getSender();
    if (event.getType() !== EventType.CallEncryptionKeysPrefix || !sender) return;
    const content = event.getContent<
      KeyContent & { media_key?: { index?: number }; keys?: { index?: number } }
    >();
    const memberships = rtcSession.memberships;
    logger.info(
      `key message from ${sender} wire=${event.getWireType()} ` +
        `index=${content.media_key?.index ?? content.keys?.index} ` +
        `claimed_device_id=${content.member?.claimed_device_id} ` +
        `member_id=${String(content.member_id)} member.id=${String(content.member?.id)}; ` +
        `memberships: ` +
        memberships.map((m) => `${m.userId}|${m.deviceId}|${m.memberId}`).join(', ')
    );
    const memberId = resolveKeyMemberId(sender, content, memberships);
    if (memberId === undefined) return;
    logger.warn(
      `key from ${sender}:${String(content.member?.claimed_device_id)} claims member id ` +
        `${String(content.member_id ?? content.member?.id)}, which matches no membership; ` +
        `using ${memberId} (sent by a client older than Pinniped 4.13?)`
    );
    content.member_id = memberId;
    if (content.member) content.member.id = memberId;
  };
  client.prependListener(ClientEvent.ToDeviceEvent, onToDevice);
  return (): void => {
    client.off(ClientEvent.ToDeviceEvent, onToDevice);
  };
}

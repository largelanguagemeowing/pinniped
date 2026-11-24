import { type MatrixClient } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger';

/**
 * Cancels the ring a call notification started: Matrix has no cancel event, so the
 * notification is redacted, and a client that ignores a redacted notification stops ringing.
 */
export async function cancelRing(
  mx: Pick<MatrixClient, 'redactEvent'>,
  roomId: string,
  notification: { event_id: string } | null
): Promise<void> {
  if (!notification) return;
  try {
    await mx.redactEvent(roomId, notification.event_id);
  } catch (error) {
    logger.warn('Failed to cancel the ring', error);
  }
}

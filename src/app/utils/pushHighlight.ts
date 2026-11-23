import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

/**
 * Whether the user's own push rules mark `mEvent` as a highlight (a mention of them, their name
 * or a keyword). The server decides this per event; the client only reads the rule's tweak.
 * Own events never count, whatever the rules say.
 */
export const isHighlightForUser = (mx: MatrixClient, mEvent: MatrixEvent): boolean => {
  if (mEvent.getSender() === mx.getUserId()) return false;
  return mx.getPushActionsForEvent(mEvent)?.tweaks?.highlight === true;
};

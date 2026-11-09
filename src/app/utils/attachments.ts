import { IContent } from 'matrix-js-sdk';

/**
 * Fork-only. A message with several files is sent as one event per file, all
 * tagged with the same group id. Pinniped draws consecutive events from one
 * sender with the same id as a single grid; other clients show them one by one.
 */
export const ATTACHMENTS_CONTENT_KEY = 'club.stablecat.pinniped.attachments';

export const getAttachmentGroupId = (content: IContent): string | undefined => {
  const id = content[ATTACHMENTS_CONTENT_KEY];
  return typeof id === 'string' && id !== '' ? id : undefined;
};

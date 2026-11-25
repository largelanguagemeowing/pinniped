import { IContent, MatrixEvent } from 'matrix-js-sdk';

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

const isSameGroup = (a: MatrixEvent, b: MatrixEvent): boolean => {
  const groupId = getAttachmentGroupId(a.getContent());
  return (
    groupId !== undefined &&
    groupId === getAttachmentGroupId(b.getContent()) &&
    a.getSender() === b.getSender()
  );
};

/**
 * The files drawn together with `event`, in timeline order, or just `event` when it has no
 * group or is not drawn itself. The first one hosts the grid; the others draw nothing.
 *
 * A file that is not drawn (redacted, or from an ignored sender) is left out, so the next one
 * hosts the grid instead of the group vanishing with it.
 *
 * @param event The event being rendered.
 * @param eventAt The event `offset` places after `event` in the timeline (negative for before).
 * @param isDrawn Whether an event is shown at all.
 */
export const getAttachmentGroup = (
  event: MatrixEvent,
  eventAt: (offset: number) => MatrixEvent | undefined,
  isDrawn: (event: MatrixEvent) => boolean
): MatrixEvent[] => {
  if (getAttachmentGroupId(event.getContent()) === undefined || !isDrawn(event)) return [event];

  const members = [event];
  const scan = (step: 1 | -1) => {
    let neighbour = eventAt(step);
    for (let offset = step; neighbour && isSameGroup(event, neighbour); offset += step) {
      if (isDrawn(neighbour)) {
        if (step === 1) members.push(neighbour);
        else members.unshift(neighbour);
      }
      neighbour = eventAt(offset + step);
    }
  };
  scan(-1);
  scan(1);
  return members;
};

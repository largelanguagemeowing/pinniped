import { MatrixEvent } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import { ATTACHMENTS_CONTENT_KEY, getAttachmentGroup } from '../../src/app/utils/attachments';

const file = (id: string, group?: string, sender = '@a:example.org') =>
  new MatrixEvent({
    event_id: id,
    sender,
    type: 'm.room.message',
    content: {
      msgtype: 'm.image',
      body: id,
      ...(group ? { [ATTACHMENTS_CONTENT_KEY]: group } : {}),
    },
  });

/** The group of `timeline[at]`, with these events not drawn. */
const groupAt = (timeline: MatrixEvent[], at: number, undrawn: string[] = []) =>
  getAttachmentGroup(
    timeline[at],
    (offset) => timeline[at + offset],
    (event) => !undrawn.includes(event.getId()!)
  ).map((event) => event.getId());

describe('getAttachmentGroup', () => {
  const [f1, f2, f3] = [file('$1', 'g'), file('$2', 'g'), file('$3', 'g')];
  const timeline = [file('$before'), f1, f2, f3, file('$after')];

  it('is the whole group for any of its files, in order', () => {
    expect(groupAt(timeline, 1)).toEqual(['$1', '$2', '$3']);
    expect(groupAt(timeline, 3)).toEqual(['$1', '$2', '$3']);
  });

  it('is just the event when it has no group', () => {
    expect(groupAt(timeline, 0)).toEqual(['$before']);
  });

  it('does not join files of another sender or group', () => {
    const mixed = [file('$1', 'g'), file('$2', 'g', '@b:example.org'), file('$3', 'h')];
    expect(groupAt(mixed, 0)).toEqual(['$1']);
  });

  // the first file is redacted or from an ignored sender: the grid is hosted by the next one
  it('leaves out a first file that is not drawn, so the rest still has a host', () => {
    expect(groupAt(timeline, 2, ['$1'])).toEqual(['$2', '$3']);
    expect(groupAt(timeline, 3, ['$1'])).toEqual(['$2', '$3']);
  });

  it('leaves out a middle file that is not drawn', () => {
    expect(groupAt(timeline, 1, ['$2'])).toEqual(['$1', '$3']);
  });

  it('gives a file that is not drawn no group', () => {
    expect(groupAt(timeline, 1, ['$1'])).toEqual(['$1']);
  });
});

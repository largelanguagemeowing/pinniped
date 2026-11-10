import { describe, expect, it } from 'vitest';
import { MsgType, RelationType } from 'matrix-js-sdk';
import { getUploadMessages } from '../../src/app/features/room/msgContent';
import { ATTACHMENTS_CONTENT_KEY } from '../../src/app/utils/attachments';
import { IReplyDraft } from '../../src/app/state/room/roomInputDrafts';

const file = (name: string) => ({
  msgtype: MsgType.Image,
  body: name,
  filename: name,
  url: `mxc://hs/${name}`,
});
const caption = {
  msgtype: MsgType.Text,
  body: 'look **here**',
  format: 'org.matrix.custom.html',
  formatted_body: 'look <strong>here</strong>',
  'm.mentions': { user_ids: ['@a:hs'] },
};
const reply = { userId: '@a:hs', eventId: '$parent', body: 'hi' } as IReplyDraft;

describe('getUploadMessages', () => {
  it('sends a single file as it is, without a group id', () => {
    const [only, ...rest] = getUploadMessages({ files: [file('a.png')] });
    expect(rest).toEqual([]);
    expect(only).toEqual(file('a.png'));
  });

  it('tags several files with the same group id and keeps each a complete message', () => {
    const messages = getUploadMessages({
      files: [file('a.png'), file('b.png')],
      groupId: 'group',
    });
    expect(messages.map((m) => m[ATTACHMENTS_CONTENT_KEY])).toEqual(['group', 'group']);
    messages.forEach((m, i) => {
      expect(m.msgtype).toBe(MsgType.Image);
      expect(m.url).toBe(file(i === 0 ? 'a.png' : 'b.png').url);
    });
  });

  it('puts the typed text on the first file as a spec caption', () => {
    const [first, second] = getUploadMessages({
      files: [file('a.png'), file('b.png')],
      caption,
      groupId: 'group',
    });
    // A caption is a body that differs from the filename, on the media event itself.
    expect(first).toMatchObject({
      msgtype: MsgType.Image,
      filename: 'a.png',
      body: caption.body,
      format: caption.format,
      formatted_body: caption.formatted_body,
      'm.mentions': caption['m.mentions'],
    });
    expect(second.body).toBe('b.png');
    expect(second.formatted_body).toBeUndefined();
  });

  it('sends the text on its own when there is no file to carry it', () => {
    expect(getUploadMessages({ files: [], caption })).toEqual([caption]);
  });

  it('replies with the first event only', () => {
    const [first, second, third] = getUploadMessages({
      files: [file('a.png'), file('b.png'), file('c.png')],
      groupId: 'group',
      replyDraft: reply,
    });
    expect(first['m.relates_to']).toEqual({ 'm.in_reply_to': { event_id: '$parent' } });
    expect(second['m.relates_to']).toBeUndefined();
    expect(third['m.relates_to']).toBeUndefined();
  });

  it('keeps every event in the thread', () => {
    const messages = getUploadMessages({
      files: [file('a.png'), file('b.png')],
      groupId: 'group',
      replyDraft: {
        ...reply,
        relation: { rel_type: RelationType.Thread, event_id: '$root' },
      } as IReplyDraft,
    });
    messages.forEach((m) =>
      expect(m['m.relates_to']).toMatchObject({
        rel_type: RelationType.Thread,
        event_id: '$root',
      })
    );
  });
});

import { describe, expect, it } from 'vitest';
import { EventTimelineSet, MatrixEvent, MsgType } from 'matrix-js-sdk';
import { toExportMessage } from '../../src/app/features/room/export/chatExport';
import { ChatExportImageCollector } from '../../src/app/features/room/export/exportChat';

const event = (id: string, ts: number, content: Record<string, unknown>) =>
  new MatrixEvent({
    type: 'm.room.message',
    sender: '@alice:example.org',
    event_id: id,
    origin_server_ts: ts,
    room_id: '!room:example.org',
    content,
  });

const timelineSetWithEdit = (edit: MatrixEvent) =>
  ({
    relations: {
      getChildEventsForEvent: (_id: string, relType: string) =>
        relType === 'm.replace' ? { getRelations: () => [edit] } : undefined,
    },
  }) as unknown as EventTimelineSet;

describe('exporting an edited image message', () => {
  const original = event('$img', 1000, {
    msgtype: MsgType.Image,
    body: 'old.png',
    url: 'mxc://example.org/old',
    info: { mimetype: 'image/png', size: 10, w: 1, h: 1 },
  });
  const edit = event('$edit', 2000, {
    msgtype: MsgType.Image,
    body: '* new.jpg',
    'm.new_content': {
      msgtype: MsgType.Image,
      body: 'new.jpg',
      url: 'mxc://example.org/new',
      info: { mimetype: 'image/jpeg', size: 20, w: 2, h: 2 },
    },
    'm.relates_to': { rel_type: 'm.replace', event_id: '$img' },
  });

  it('stores the edited media next to the edited body', () => {
    const collector = new ChatExportImageCollector();
    const message = toExportMessage(original, {
      timelineSet: timelineSetWithEdit(edit),
      getSenderName: (id) => id,
      resolveFile: (mEvent, content) => collector.collect(mEvent, content),
    });

    expect(message?.body).toBe('new.jpg');
    expect(message?.file).toMatchObject({ name: 'new.jpg', mimetype: 'image/jpeg', size: 20 });
    expect(collector.tasks.map((task) => task.ref.mxcUrl)).toEqual(['mxc://example.org/new']);
  });

  it('keeps the original media of an unedited message', () => {
    const collector = new ChatExportImageCollector();
    const message = toExportMessage(original, {
      getSenderName: (id) => id,
      resolveFile: (mEvent, content) => collector.collect(mEvent, content),
    });

    expect(message?.file).toMatchObject({ name: 'old.png' });
    expect(collector.tasks.map((task) => task.ref.mxcUrl)).toEqual(['mxc://example.org/old']);
  });
});

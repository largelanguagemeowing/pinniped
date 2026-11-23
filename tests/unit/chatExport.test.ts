import { describe, expect, it } from 'vitest';
import { EventTimeline, MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import {
  getExportRangeEvents,
  getExportImageRef,
  isExportableEvent,
  summarizeExportRange,
  toExportMessage,
} from '../../src/app/features/room/export/chatExport';
import {
  ChatExportImageCollector,
  buildArchiveName,
  sanitizeArchiveName,
  sanitizeExportFileName,
} from '../../src/app/features/room/export/exportChat';
import { placeExportAnchor } from '../../src/app/state/room/roomExport';

let nextTs = 1000;
const makeEvent = (overrides: Record<string, unknown> = {}) => {
  nextTs += 1000;
  return new MatrixEvent({
    type: 'm.room.message',
    sender: '@alice:example.org',
    event_id: `$event-${nextTs}`,
    origin_server_ts: nextTs,
    room_id: '!room:example.org',
    content: { msgtype: MsgType.Text, body: 'hello' },
    ...overrides,
  });
};

const identity = (userId: string) => userId;

describe('chat export event filter', () => {
  it('keeps messages, stickers and polls but drops relations and state', () => {
    expect(isExportableEvent(makeEvent())).toBe(true);
    expect(isExportableEvent(makeEvent({ type: 'm.sticker', content: { body: 's' } }))).toBe(true);

    expect(
      isExportableEvent(
        makeEvent({
          content: {
            msgtype: MsgType.Text,
            body: '* edit',
            'm.new_content': { msgtype: MsgType.Text, body: 'edited' },
            'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
          },
        })
      )
    ).toBe(false);

    expect(
      isExportableEvent(
        makeEvent({
          state_key: '',
          content: { topic: 'a topic' },
        })
      )
    ).toBe(false);
  });

  it('counts messages and images', () => {
    const image = makeEvent({
      content: {
        msgtype: MsgType.Image,
        body: 'cat.png',
        url: 'mxc://example.org/cat',
        info: { mimetype: 'image/png', w: 10, h: 10 },
      },
    });
    expect(summarizeExportRange([makeEvent(), image, makeEvent({ state_key: '' })])).toEqual({
      messages: 2,
      images: 1,
    });
  });
});

describe('toExportMessage', () => {
  it('strips reply fallback from the body and keeps reply metadata', () => {
    const event = makeEvent({
      content: {
        msgtype: MsgType.Text,
        body: '> <@bob:example.org> earlier\n\nactual answer',
        'm.relates_to': { 'm.in_reply_to': { event_id: '$bob-event' } },
      },
    });

    const message = toExportMessage(event, { getSenderName: identity });
    expect(message).toMatchObject({
      eventId: event.getId(),
      sender: { id: '@alice:example.org', name: '@alice:example.org' },
      msgtype: MsgType.Text,
      body: 'actual answer',
      replyTo: '$bob-event',
    });
    expect(message?.timestamp).toBe(new Date(event.getTs()).toISOString());
  });

  it('marks redacted and undecryptable events without leaking content', () => {
    const redacted = makeEvent();
    redacted.makeRedacted(
      new MatrixEvent({
        type: 'm.room.redaction',
        sender: '@bob:example.org',
        event_id: '$redaction',
        origin_server_ts: 5,
        content: { reason: 'spam' },
      })
    );

    expect(toExportMessage(redacted, { getSenderName: identity })).toMatchObject({
      redacted: true,
      redactionReason: 'spam',
    });
  });

  it('flattens polls with their answers', () => {
    const event = makeEvent({
      type: 'org.matrix.msc3381.poll.start',
      content: {
        'org.matrix.msc3381.poll.start': {
          question: { 'org.matrix.msc1767.text': 'Lunch?' },
          kind: 'org.matrix.msc3381.poll.disclosed',
          max_selections: 1,
          answers: [
            { id: 'a', 'org.matrix.msc1767.text': 'Pizza' },
            { id: 'b', 'org.matrix.msc1767.text': 'Sushi' },
          ],
        },
      },
    });

    expect(toExportMessage(event, { getSenderName: identity })?.poll).toMatchObject({
      question: 'Lunch?',
      answers: ['Pizza', 'Sushi'],
      maxSelections: 1,
      disclosed: true,
    });
  });
});

describe('export image refs', () => {
  const imageEvent = (content: Record<string, unknown>) =>
    makeEvent({ content: { body: 'image', ...content } });

  it('only treats images and stickers as exportable media', () => {
    expect(
      getExportImageRef(imageEvent({ msgtype: MsgType.Image, url: 'mxc://example.org/a' }))
    ).toMatchObject({ mxcUrl: 'mxc://example.org/a' });
    expect(
      getExportImageRef(imageEvent({ msgtype: MsgType.Video, url: 'mxc://example.org/v' }))
    ).toBeUndefined();
    expect(getExportImageRef(imageEvent({ msgtype: MsgType.Text }))).toBeUndefined();
    expect(
      getExportImageRef(
        makeEvent({ type: 'm.sticker', content: { body: 's', url: 'mxc://example.org/s' } })
      )
    ).toMatchObject({ mxcUrl: 'mxc://example.org/s' });
  });

  it('prefers the encrypted file url over the plain one', () => {
    expect(
      getExportImageRef(
        imageEvent({
          msgtype: MsgType.Image,
          url: 'mxc://example.org/plain',
          file: { url: 'mxc://example.org/encrypted', v: 'v2', key: {}, iv: '', hashes: {} },
        })
      )?.mxcUrl
    ).toBe('mxc://example.org/encrypted');
  });
});

describe('ChatExportImageCollector', () => {
  it('derives names from the file name and keeps extensions unique', () => {
    const collector = new ChatExportImageCollector();
    const image = (url: string, filename: string) =>
      collector.collect(
        makeEvent({
          content: {
            msgtype: MsgType.Image,
            body: filename,
            filename,
            url,
            info: { mimetype: 'image/png' },
          },
        })
      );

    expect(image('mxc://a', 'cat.png')?.path).toBe('files/cat.png');
    expect(image('mxc://b', 'cat.png')?.path).toBe('files/cat-2.png');
    expect(image('mxc://a', 'cat.png')?.path).toBe('files/cat.png');
    expect(collector.tasks).toHaveLength(2);
  });

  it('falls back to the mime type when the name has no extension', () => {
    const collector = new ChatExportImageCollector();
    expect(
      collector.collect(
        makeEvent({
          content: {
            msgtype: MsgType.Image,
            body: 'screenshot',
            url: 'mxc://a',
            info: { mimetype: 'image/jpeg' },
          },
        })
      )?.path
    ).toBe('files/screenshot.jpeg');
  });

  it('sanitizes names', () => {
    expect(sanitizeExportFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(sanitizeExportFileName('   ')).toBe('image');
  });
});

describe('archive naming', () => {
  it('uses the room name and the selected day range', () => {
    const start = Date.UTC(2024, 4, 1, 10);
    const end = Date.UTC(2024, 4, 3, 10);
    expect(buildArchiveName('My Room', start, end)).toBe('My-Room-2024-05-01_2024-05-03.zip');
    expect(buildArchiveName('My Room', start, start + 1000)).toBe('My-Room-2024-05-01.zip');
  });

  it('falls back when the name sanitizes to nothing', () => {
    expect(sanitizeArchiveName('!!!')).toBe('room');
  });
});

describe('range events', () => {
  const buildRoom = (events: MatrixEvent[]): Room => {
    const timeline = {
      getEvents: () => events,
      getNeighbouringTimeline: () => null,
    } as unknown as EventTimeline;
    const timelineSet = {
      getLiveTimeline: () => timeline,
      getTimelineForEvent: (eventId: string) =>
        events.some((evt) => evt.getId() === eventId) ? timeline : null,
    };
    return {
      roomId: '!room:example.org',
      getUnfilteredTimelineSet: () => timelineSet,
    } as unknown as Room;
  };

  it('returns the inclusive slice between both anchors, regardless of order', () => {
    const events = [makeEvent(), makeEvent(), makeEvent(), makeEvent()];
    const room = buildRoom(events);
    const forward = getExportRangeEvents(room, events[1].getId()!, events[2].getId()!);
    const backward = getExportRangeEvents(room, events[2].getId()!, events[1].getId()!);
    expect(forward).toEqual([events[1], events[2]]);
    expect(backward).toEqual([events[1], events[2]]);
  });

  it('fails clearly when an anchor is no longer loaded', () => {
    const events = [makeEvent(), makeEvent()];
    expect(() => getExportRangeEvents(buildRoom(events), '$gone', events[0].getId()!)).toThrow(
      /no longer loaded/
    );
  });
});

describe('range events across timelines', () => {
  type Chain = { events: MatrixEvent[]; next?: Chain; prev?: Chain };
  const cache = new WeakMap<Chain, EventTimeline>();
  const chainTimeline = (chain: Chain): EventTimeline => {
    const cached = cache.get(chain);
    if (cached) return cached;
    const created = {
      getEvents: () => chain.events,
      getNeighbouringTimeline: (dir: string) => {
        const neighbour = dir === 'f' ? chain.next : chain.prev;
        return neighbour ? chainTimeline(neighbour) : null;
      },
    } as unknown as EventTimeline;
    cache.set(chain, created);
    return created;
  };

  const buildRoom = (live: Chain, all: Chain[]): Room => {
    const timelineFor = (eventId: string) => {
      const found = all.find((c) => c.events.some((e) => e.getId() === eventId));
      return found ? chainTimeline(found) : null;
    };
    const timelineSet = {
      getLiveTimeline: () => chainTimeline(live),
      getTimelineForEvent: timelineFor,
    };
    return { getUnfilteredTimelineSet: () => timelineSet } as unknown as Room;
  };

  it('reads the chain of the anchors when it is not the live one', () => {
    const old: Chain = { events: [makeEvent(), makeEvent(), makeEvent()] };
    const live: Chain = { events: [makeEvent()] };
    const room = buildRoom(live, [old, live]);
    const ids = old.events.map((e) => e.getId()!);
    expect(getExportRangeEvents(room, ids[0], ids[2])).toEqual(old.events);
  });

  it('is not loaded while the anchors are in unlinked timelines', () => {
    const old: Chain = { events: [makeEvent(), makeEvent()] };
    const live: Chain = { events: [makeEvent()] };
    const room = buildRoom(live, [old, live]);
    expect(() =>
      getExportRangeEvents(room, old.events[0].getId()!, live.events[0].getId()!)
    ).toThrow(/no longer loaded/);
  });

  it('spans linked timelines', () => {
    const old: Chain = { events: [makeEvent(), makeEvent()] };
    const live: Chain = { events: [makeEvent(), makeEvent()], prev: old };
    old.next = live;
    const room = buildRoom(live, [old, live]);
    expect(getExportRangeEvents(room, old.events[1].getId()!, live.events[0].getId()!)).toEqual([
      old.events[1],
      live.events[0],
    ]);
  });
});

describe('export anchor selection', () => {
  it('replaces and toggles anchors', () => {
    const start = { eventId: '$a', ts: 1 };
    expect(placeExportAnchor({}, 'start', start)).toEqual({ start });
    expect(placeExportAnchor({ start }, 'end', { eventId: '$b', ts: 2 })).toEqual({
      start,
      end: { eventId: '$b', ts: 2 },
    });
    expect(placeExportAnchor({ start }, 'start', start)).toEqual({ start: undefined });
  });
});

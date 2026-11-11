import { describe, expect, it } from 'vitest';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  getGlobalImagePacks,
  getRoomImagePacks,
  ImagePack,
  ImageUsage,
  PackAddress,
  PONIES_ROOM_PACK_FORMAT,
  SPEC_ROOM_PACK_FORMAT,
  toShortcode,
  updateGlobalPackList,
} from '../../src/app/plugins/custom-emoji';

let eventCount = 0;
const packEvent = (
  roomId: string,
  type: string,
  stateKey: string,
  content: Record<string, unknown>
) => {
  eventCount += 1;
  return new MatrixEvent({
    type,
    state_key: stateKey,
    room_id: roomId,
    event_id: `$pack${eventCount}`,
    sender: '@admin:hs',
    content,
  });
};

const fakeRoom = (roomId: string, events: MatrixEvent[]) =>
  ({
    roomId,
    getLiveTimeline: () => ({
      getState: () => ({
        getStateEvents: (type: string) => events.filter((event) => event.getType() === type),
      }),
    }),
  }) as unknown as Room;

const fakeClient = (rooms: Room[], accountData: Record<string, unknown>) =>
  ({
    getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
    getAccountData: (type: string) =>
      type in accountData ? { getContent: () => accountData[type] } : undefined,
  }) as unknown as MatrixClient;

const image = (url: string, usage?: ImageUsage[]) => ({ url, usage });

describe('room image packs', () => {
  const room = fakeRoom('!r:hs', [
    packEvent('!r:hs', 'm.room.image_pack', '', {
      images: { cat: image('mxc://hs/cat') },
      pack: { display_name: 'Spec cats' },
    }),
    packEvent('!r:hs', 'im.ponies.room_emotes', '', {
      images: { dog: image('mxc://hs/dog') },
      pack: { display_name: 'Ponies dogs' },
    }),
  ]);

  it('reads spec and unstable packs, each addressed in its own format', () => {
    const packs = getRoomImagePacks(room);
    expect(packs.map((pack) => [pack.meta.name, pack.address?.format])).toEqual([
      ['Spec cats', SPEC_ROOM_PACK_FORMAT],
      ['Ponies dogs', PONIES_ROOM_PACK_FORMAT],
    ]);
  });

  it('honours per-image usage only in the unstable format', () => {
    const content = {
      images: { sticky: image('mxc://hs/s', [ImageUsage.Sticker]) },
      pack: { usage: [ImageUsage.Emoticon] },
    };
    const spec = ImagePack.fromMatrixEvent(
      'a',
      packEvent('!r:hs', 'm.room.image_pack', 'x', content)
    );
    const ponies = ImagePack.fromMatrixEvent(
      'b',
      packEvent('!r:hs', 'im.ponies.room_emotes', 'x', content)
    );

    expect(spec.getImages(ImageUsage.Emoticon).map((img) => img.shortcode)).toEqual(['sticky']);
    expect(spec.getImages(ImageUsage.Sticker)).toEqual([]);
    expect(spec.images.collection.get('sticky')?.content.usage).toBeUndefined();

    expect(ponies.getImages(ImageUsage.Sticker).map((img) => img.shortcode)).toEqual(['sticky']);
    expect(ponies.getImages(ImageUsage.Emoticon)).toEqual([]);
  });
});

describe('global image packs', () => {
  const room = fakeRoom('!r:hs', [
    packEvent('!r:hs', 'm.room.image_pack', 'shared', { images: { a: image('mxc://hs/a') } }),
    packEvent('!r:hs', 'im.ponies.room_emotes', 'shared', { images: { b: image('mxc://hs/b') } }),
    packEvent('!r:hs', 'm.room.image_pack', '__proto__', { images: { c: image('mxc://hs/c') } }),
  ]);

  const globalShortcodes = (accountData: Record<string, unknown>) =>
    getGlobalImagePacks(fakeClient([room], accountData)).flatMap((pack) =>
      Array.from(pack.images.collection.keys())
    );

  it('resolves each list against its own pack type', () => {
    expect(
      globalShortcodes({ 'm.image_pack.rooms': { rooms: { '!r:hs': { shared: {} } } } })
    ).toEqual(['a']);
    expect(
      globalShortcodes({ 'im.ponies.emote_rooms': { rooms: { '!r:hs': { shared: {} } } } })
    ).toEqual(['b']);
  });

  it('skips unknown rooms and malformed lists', () => {
    expect(
      globalShortcodes({ 'm.image_pack.rooms': { rooms: { '!gone:hs': { shared: {} } } } })
    ).toEqual([]);
    expect(globalShortcodes({ 'm.image_pack.rooms': { rooms: null } })).toEqual([]);
    expect(globalShortcodes({ 'm.image_pack.rooms': { rooms: { '!r:hs': null } } })).toEqual([]);
  });

  it('does not treat an inherited property as an enabled pack', () => {
    expect(globalShortcodes({ 'm.image_pack.rooms': { rooms: { '!r:hs': {} } } })).toEqual([]);
  });
});

describe('updateGlobalPackList', () => {
  const at = (roomId: string, stateKey: string) =>
    new PackAddress(roomId, stateKey, SPEC_ROOM_PACK_FORMAT);

  it('adds packs and keeps the reserved per-pack objects', () => {
    const content = { rooms: { '!a:hs': { one: { future: 1 } } } };
    expect(updateGlobalPackList(content, [at('!a:hs', 'one'), at('!b:hs', '')], [])).toEqual({
      rooms: { '!a:hs': { one: { future: 1 } }, '!b:hs': { '': {} } },
    });
  });

  it('removes packs and the rooms it empties, but not other empty rooms', () => {
    const content = { rooms: { '!a:hs': { one: {} }, '!b:hs': {} }, other: true };
    expect(updateGlobalPackList(content, [], [at('!a:hs', 'one'), at('!c:hs', 'x')])).toEqual({
      rooms: { '!b:hs': {} },
      other: true,
    });
  });

  it('does not change its input', () => {
    const content = { rooms: { '!a:hs': { one: {} } } };
    updateGlobalPackList(content, [at('!a:hs', 'two')], [at('!a:hs', 'one')]);
    expect(content).toEqual({ rooms: { '!a:hs': { one: {} } } });
  });

  it('starts a list from empty content', () => {
    expect(updateGlobalPackList({}, [at('!a:hs', '')], [])).toEqual({
      rooms: { '!a:hs': { '': {} } },
    });
  });
});

describe('toShortcode', () => {
  it('maps names onto the shortcode grammar', () => {
    expect(toShortcode('cat_wave-2')).toBe('cat_wave-2');
    expect(toShortcode('my cat.wave')).toBe('my-cat-wave');
    expect(toShortcode('Katze 🐱: süß')).toBe('Katze-s-');
    expect(toShortcode('x'.repeat(150))).toHaveLength(100);
  });
});

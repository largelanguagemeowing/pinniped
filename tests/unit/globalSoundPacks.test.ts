import { describe, expect, it } from 'vitest';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { getGlobalSoundPacks } from '../../src/app/plugins/sound-pack';
import { updateGlobalPackList } from '../../src/app/plugins/custom-emoji';

const LIST = 'club.stablecat.pinniped.sound_rooms';
const SOUNDS = 'club.stablecat.pinniped.room_sounds';

const fakeRoom = (roomId: string, content?: Record<string, unknown>) => {
  const event = content
    ? new MatrixEvent({
        type: SOUNDS,
        state_key: '',
        room_id: roomId,
        event_id: `$${roomId}`,
        sender: '@a:hs',
        content,
      })
    : undefined;
  return {
    roomId,
    getLiveTimeline: () => ({
      getState: () => ({ getStateEvents: () => event }),
    }),
  } as unknown as Room;
};

const fakeClient = (rooms: Room[], list: unknown) =>
  ({
    getRoom: (roomId: string) => rooms.find((r) => r.roomId === roomId) ?? null,
    getAccountData: (type: string) =>
      type === LIST && list !== undefined ? { getContent: () => list } : undefined,
  }) as unknown as MatrixClient;

const zap = { sounds: { zap: { url: 'mxc://hs/zap' } } };

describe('getGlobalSoundPacks', () => {
  it('returns the packs of listed, joined rooms', () => {
    const rooms = [fakeRoom('!a:hs', zap), fakeRoom('!b:hs', zap), fakeRoom('!c:hs', zap)];
    const list = { rooms: { '!a:hs': { '': {} }, '!c:hs': { '': {} }, '!gone:hs': { '': {} } } };
    const packs = getGlobalSoundPacks(fakeClient(rooms, list));
    expect(packs.map((p) => p.id)).toEqual(['!a:hs', '!c:hs']);
    expect(packs[0].sounds.map((s) => s.key)).toEqual(['!a:hs/zap']);
  });

  it('ignores rooms listed under other state keys', () => {
    const list = { rooms: { '!a:hs': { other: {} } } };
    expect(getGlobalSoundPacks(fakeClient([fakeRoom('!a:hs', zap)], list))).toEqual([]);
  });

  it('is empty without a list or with a malformed one', () => {
    const rooms = [fakeRoom('!a:hs', zap)];
    expect(getGlobalSoundPacks(fakeClient(rooms, undefined))).toEqual([]);
    expect(getGlobalSoundPacks(fakeClient(rooms, { rooms: 'x' }))).toEqual([]);
    expect(getGlobalSoundPacks(fakeClient(rooms, { rooms: { '!a:hs': null } }))).toEqual([]);
  });

  it('gives a listed room without a sound event an empty pack', () => {
    const list = { rooms: { '!a:hs': { '': {} } } };
    const [pack] = getGlobalSoundPacks(fakeClient([fakeRoom('!a:hs')], list));
    expect(pack.sounds).toEqual([]);
  });

  it('round-trips through the list update', () => {
    const at = { roomId: '!a:hs', stateKey: '' };
    const list = updateGlobalPackList({}, [at], []);
    expect(getGlobalSoundPacks(fakeClient([fakeRoom('!a:hs', zap)], list))).toHaveLength(1);
    const cleared = updateGlobalPackList(list, [], [at]);
    expect(getGlobalSoundPacks(fakeClient([fakeRoom('!a:hs', zap)], cleared))).toEqual([]);
  });
});

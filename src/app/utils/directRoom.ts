import { ICreateRoomStateEvent, MatrixClient, Preset, Visibility } from 'matrix-js-sdk';
import { StateEvent } from '../../types/matrix/room';
import { createRoomEncryptionState } from '../components/create-room/utils';
import { addRoomIdToMDirect } from './matrix';

/**
 * Room version of a one-to-one chat. Version 12 makes both people creators (the trusted private
 * chat preset invites the other as an additional creator), and creators have unlimited power, so
 * no power level can keep either from inviting. Version 11 has no creators: both get power 100
 * from the preset, which `INVITE_LOCKED_LEVEL` is above.
 */
export type DirectRoomVersion = '12' | '11';

export const DIRECT_ROOM_VERSIONS: DirectRoomVersion[] = ['12', '11'];
export const DEFAULT_DIRECT_ROOM_VERSION: DirectRoomVersion = '12';

/**
 * Out of reach of everyone in the room, and of any change afterwards (one cannot set a level
 * above one's own). The server checks the invite made while the room is created against it, so
 * the creator starts at this level and steps down once the other person is invited.
 */
export const INVITE_LOCKED_LEVEL = 101;

type DirectRoomOptions = { encrypted?: boolean };

const createDirect = async (
  mx: MatrixClient,
  invite: string[],
  listedFor: string,
  preset: Preset,
  extra: {
    room_version?: string;
    power_level_content_override?: object;
  },
  { encrypted = true }: DirectRoomOptions
): Promise<string> => {
  const initialState: ICreateRoomStateEvent[] = encrypted ? [createRoomEncryptionState()] : [];
  const { room_id: roomId } = await mx.createRoom({
    is_direct: true,
    invite,
    visibility: Visibility.Private,
    preset,
    initial_state: initialState,
    ...extra,
  });
  await addRoomIdToMDirect(mx, roomId, listedFor);
  return roomId;
};

/** Lowers our own level to the other person's, which leaves the invite level above both. */
const stepDownBelowInviteLevel = async (mx: MatrixClient, roomId: string): Promise<void> => {
  const levels = await mx.getStateEvent(roomId, StateEvent.RoomPowerLevels, '');
  await mx.sendStateEvent(roomId, StateEvent.RoomPowerLevels, {
    ...levels,
    users: { ...levels.users, [mx.getSafeUserId()]: 100 },
  });
};

/** A chat of two. On version 11 nobody can invite a third person; on 12 both are creators. */
export const createDirectChat = async (
  mx: MatrixClient,
  userId: string,
  {
    version = DEFAULT_DIRECT_ROOM_VERSION,
    ...options
  }: DirectRoomOptions & {
    version?: DirectRoomVersion;
  } = {}
): Promise<string> => {
  const roomId = await createDirect(
    mx,
    [userId],
    userId,
    Preset.TrustedPrivateChat,
    {
      room_version: version,
      power_level_content_override:
        version === '11'
          ? // a shallow override: the users are spelled out, the other person at the preset's 100
            {
              invite: INVITE_LOCKED_LEVEL,
              users: { [mx.getSafeUserId()]: INVITE_LOCKED_LEVEL, [userId]: 100 },
            }
          : undefined,
    },
    options
  );
  if (version === '11') await stepDownBelowInviteLevel(mx, roomId);
  return roomId;
};

/**
 * A group chat: its creator alone can kick and ban; everyone can invite, send messages and
 * join calls. The invited are plain members (the private chat preset, not the trusted one).
 * `listedFor` is the person it is listed under in `m.direct`.
 */
export const createDirectGroup = (
  mx: MatrixClient,
  invite: string[],
  listedFor: string,
  options: DirectRoomOptions = {}
): Promise<string> =>
  createDirect(
    mx,
    invite,
    listedFor,
    Preset.PrivateChat,
    {
      power_level_content_override: {
        invite: 0,
        kick: 100,
        ban: 100,
        events: { 'm.room.power_levels': 100, [StateEvent.GroupCallMemberPrefix]: 0 },
      },
    },
    options
  );

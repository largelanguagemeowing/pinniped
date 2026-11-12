import { isPowerTagIconKey } from '../utils/powerTagIcon';
import { useCallback, useMemo } from 'react';
import { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';
import { getPowerLevelTag, usePowerLevelTags } from './usePowerLevelTags';
import { IPowerLevels, readPowerLevel } from './usePowerLevels';
import { MemberPowerTag, MemberPowerTagIcon, PowerLevelTags } from '../../types/matrix/room';
import { useRoomCreatorsTag } from './useRoomCreatorsTag';
import { color } from 'folds';
import { ThemeKind, useTheme } from './useTheme';
import { getRolePalette } from '../themes/fork/roleHues';
import { useReadableColor } from './useReadableColor';
import { resolveRoleColors } from '../plugins/roleColor';
import { toneOf } from '../plugins/roleTone';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { isMxcUrl } from '../utils/mxc';

export type GetMemberPowerTag = (userId: string) => MemberPowerTag;

export const useGetMemberPowerTag = (
  room: Room,
  creators: Set<string>,
  powerLevels: IPowerLevels
) => {
  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);

  const getMemberPowerTag: GetMemberPowerTag = useCallback(
    (userId) => {
      if (creators.has(userId)) {
        return creatorsTag;
      }

      const power = readPowerLevel.user(powerLevels, userId);
      return getPowerLevelTag(powerLevelTags, power);
    },
    [creators, creatorsTag, powerLevels, powerLevelTags]
  );

  return getMemberPowerTag;
};

export const getPowerTagIconSrc = (
  mx: MatrixClient,
  useAuthentication: boolean,
  icon: MemberPowerTagIcon
): string | undefined => {
  if (!isPowerTagIconKey(icon?.key)) return undefined;
  return isMxcUrl(icon.key)
    ? (mx.mxcUrlToHttp(icon.key, 96, 96, 'scale', undefined, undefined, useAuthentication) ?? '🌻')
    : icon.key;
};

export const useAccessiblePowerTagColors = (
  creatorsTag: MemberPowerTag,
  powerLevelTags: PowerLevelTags
): Map<string, string> => {
  const [mode] = useSetting(settingsAtom, 'roleColorMode');
  const { id: themeId, kind } = useTheme();
  const [spread] = useSetting(settingsAtom, 'spreadRoleColors');
  const readable = useReadableColor();

  return useMemo(() => {
    const tagColors: string[] = [];
    [creatorsTag, ...Object.values(powerLevelTags)].forEach((tag) => {
      if (tag.color) tagColors.push(tag.color);
    });
    const base = {
      text: color.Background.OnContainer,
      background: color.Background.Container,
      strongerWhenBrighter: kind === ThemeKind.Dark,
    };
    return resolveRoleColors(mode, tagColors, getRolePalette(themeId), {
      readable,
      spread,
      tone: (tagColor) => toneOf(tagColor, base),
    });
  }, [mode, spread, themeId, kind, powerLevelTags, creatorsTag, readable]);
};

export const useFlattenPowerTagMembers = (
  members: RoomMember[],
  getTag: GetMemberPowerTag
): Array<MemberPowerTag | RoomMember> => {
  const PLTagOrRoomMember = useMemo(() => {
    let prevTag: MemberPowerTag | undefined;
    const tagOrMember: Array<MemberPowerTag | RoomMember> = [];
    members.forEach((member) => {
      const tag = getTag(member.userId);
      if (tag !== prevTag) {
        prevTag = tag;
        tagOrMember.push(tag);
      }
      tagOrMember.push(member);
    });
    return tagOrMember;
  }, [members, getTag]);

  return PLTagOrRoomMember;
};

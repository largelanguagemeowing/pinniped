import { Room } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { IPowerLevels } from './usePowerLevels';
import { useStateEvent } from './useStateEvent';
import { MemberPowerTag, StateEvent } from '../../types/matrix/room';
import { sanitizeStateTag } from '../utils/powerTagColor';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';

export type PowerLevelTags = Record<number, MemberPowerTag>;

const powerSortFn = (a: number, b: number) => b - a;
const sortPowers = (powers: number[]): number[] => powers.sort(powerSortFn);

export const getPowers = (tags: PowerLevelTags): number[] => {
  const powers: number[] = Object.keys(tags)
    .map((p) => {
      const power = parseInt(p, 10);
      if (Number.isNaN(power)) {
        return undefined;
      }
      return power;
    })
    .filter((power) => typeof power === 'number');

  return sortPowers(powers);
};

export const getUsedPowers = (powerLevels: IPowerLevels): Set<number> => {
  const powers: Set<number> = new Set();

  const findAndAddPower = (data: Record<string, unknown>) => {
    Object.keys(data).forEach((key) => {
      const powerOrAny: unknown = data[key];

      if (typeof powerOrAny === 'number') {
        powers.add(powerOrAny);
        return;
      }
      if (powerOrAny && typeof powerOrAny === 'object') {
        findAndAddPower(powerOrAny as Record<string, unknown>);
      }
    });
  };

  findAndAddPower(powerLevels);

  return powers;
};

const DEFAULT_TAGS: PowerLevelTags = {
  9001: {
    name: 'Goku',
    color: '#e67e22',
  },
  150: {
    name: 'Manager',
    color: '#e74c3c',
  },
  101: {
    name: 'Founder',
    color: '#f1c40f',
  },
  100: {
    name: 'Admin',
    color: '#3498db',
  },
  50: {
    name: 'Moderator',
    color: '#2ecc71',
  },
  0: {
    name: 'Member',
    color:
      'color-mix(in oklab, var(--neutral-12) 100%, var(--custom-theme-text-color, #000) var(--custom-theme-text-color-amount, 0%))',
  },
  [-1]: {
    name: 'Muted',
    color: '#979c9f',
  },
};

const generateFallbackTag = (powerLevelTags: PowerLevelTags, power: number): MemberPowerTag => {
  const highToLow = sortPowers(getPowers(powerLevelTags));

  const tagPower = highToLow.find((p) => p < power);
  const tag = typeof tagPower === 'number' ? powerLevelTags[tagPower] : undefined;

  return {
    name: tag ? `${tag.name} ${power}` : `Team ${power}`,
  };
};

export const usePowerLevelTags = (room: Room, powerLevels: IPowerLevels): PowerLevelTags => {
  const tagsEvent = useStateEvent(room, StateEvent.PowerLevelTags);
  // Developer tools show raw colour values as they are stored, for testing.
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  const powerLevelTags: PowerLevelTags = useMemo(() => {
    const content = tagsEvent?.getContent<PowerLevelTags>() ?? {};
    const powerToTags: PowerLevelTags = {};
    Object.entries(content).forEach(([power, tag]) => {
      if (tag && typeof tag === 'object') {
        powerToTags[Number(power)] = developerTools ? tag : sanitizeStateTag(tag);
      }
    });

    const powers = getUsedPowers(powerLevels);
    Array.from(powers).forEach((power) => {
      if (powerToTags[power]?.name === undefined) {
        powerToTags[power] = DEFAULT_TAGS[power] ?? generateFallbackTag(DEFAULT_TAGS, power);
      }
    });

    return powerToTags;
  }, [powerLevels, tagsEvent, developerTools]);

  return powerLevelTags;
};

export const getPowerLevelTag = (
  powerLevelTags: PowerLevelTags,
  powerLevel: number
): MemberPowerTag => {
  const tag: MemberPowerTag | undefined = powerLevelTags[powerLevel];
  return tag ?? generateFallbackTag(powerLevelTags, powerLevel);
};

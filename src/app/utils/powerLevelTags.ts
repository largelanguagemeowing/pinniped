import { IPowerLevels } from '../hooks/usePowerLevels';
import { MemberPowerTag, PowerLevelTags } from '../../types/matrix/room';
import { sanitizeStateTag } from './powerTagColor';

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

export const FOUNDER_POWER = 101;

const generateFallbackTag = (powerLevelTags: PowerLevelTags, power: number): MemberPowerTag => {
  const highToLow = sortPowers(getPowers(powerLevelTags));

  const tagPower = highToLow.find((p) => p < power);
  const tag = typeof tagPower === 'number' ? powerLevelTags[tagPower] : undefined;

  return {
    name: tag ? `${tag.name} ${power}` : `Team ${power}`,
  };
};

/** Room tags for every power in use, falling back to built-in names for unnamed powers. */
export const resolvePowerLevelTags = (
  content: PowerLevelTags,
  powerLevels: IPowerLevels,
  developerTools: boolean
): PowerLevelTags => {
  const powerToTags: PowerLevelTags = {};
  Object.entries(content).forEach(([power, tag]) => {
    if (tag && typeof tag === 'object') {
      powerToTags[Number(power)] = developerTools ? tag : sanitizeStateTag(tag);
    }
  });

  // Unnamed powers take the nearest tag the room defines below them, so a room's own names
  // carry into powers it did not name; built-in names only apply when the room has none below.
  const roomTags: PowerLevelTags = Object.fromEntries(
    Object.entries(powerToTags).filter(([, tag]) => tag.name !== undefined)
  );
  // Founder is always listed so its colour can be edited before anyone holds that power.
  const powers = new Set([...getUsedPowers(powerLevels), FOUNDER_POWER]);
  Array.from(powers).forEach((power) => {
    if (powerToTags[power]?.name !== undefined) return;
    if (DEFAULT_TAGS[power]) {
      powerToTags[power] = DEFAULT_TAGS[power];
      return;
    }
    const hasRoomTagBelow = getPowers(roomTags).some((p) => p < power);
    powerToTags[power] = generateFallbackTag(hasRoomTagBelow ? roomTags : DEFAULT_TAGS, power);
  });

  return powerToTags;
};

export const getPowerLevelTag = (
  powerLevelTags: PowerLevelTags,
  powerLevel: number
): MemberPowerTag => {
  const tag: MemberPowerTag | undefined = powerLevelTags[powerLevel];
  return tag ?? generateFallbackTag(powerLevelTags, powerLevel);
};

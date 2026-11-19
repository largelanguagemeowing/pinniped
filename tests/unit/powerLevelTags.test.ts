import { describe, expect, it } from 'vitest';
import { getPowerLevelTag, resolvePowerLevelTags } from '../../src/app/utils/powerLevelTags';
import { IPowerLevels, readPowerLevel } from '../../src/app/hooks/usePowerLevels';
import { PowerLevelTags } from '../../src/types/matrix/room';

const resolve = (content: PowerLevelTags, powerLevels: IPowerLevels) =>
  resolvePowerLevelTags(content, powerLevels, false);

const tagNameOf = (content: PowerLevelTags, powerLevels: IPowerLevels, userId: string) =>
  getPowerLevelTag(resolve(content, powerLevels), readPowerLevel.user(powerLevels, userId)).name;

describe('role resolution', () => {
  it('names an unnamed power after the nearest tag the room defines', () => {
    const content: PowerLevelTags = {
      100: { name: 'Boss' },
      50: { name: 'Mod' },
    };
    const powerLevels: IPowerLevels = { users: { bob: 75 } };

    expect(tagNameOf(content, powerLevels, 'bob')).toBe('Mod 75');
  });

  it('names a power above the room top tag after that tag, not the built-in Founder', () => {
    const content: PowerLevelTags = { 100: { name: 'Boss' } };
    const powerLevels: IPowerLevels = { users: { alice: 120 } };

    expect(tagNameOf(content, powerLevels, 'alice')).toBe('Boss 120');
  });

  it('uses the room name for a named power', () => {
    const content: PowerLevelTags = { 50: { name: 'Mod' } };
    const powerLevels: IPowerLevels = { users: { carol: 50 } };

    expect(tagNameOf(content, powerLevels, 'carol')).toBe('Mod');
  });

  it('lists Founder even when no one holds power 101', () => {
    const resolved = resolve({}, { users: {} });

    expect(resolved[101]?.name).toBe('Founder');
  });
});

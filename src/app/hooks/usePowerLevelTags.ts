import { Room } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { useStateEvent } from './useStateEvent';
import { PowerLevelTags, StateEvent } from '../../types/matrix/room';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { IPowerLevels } from './usePowerLevels';
import { resolvePowerLevelTags } from '../utils/powerLevelTags';

export {
  getPowers,
  getPowerLevelTag,
  getUsedPowers,
  resolvePowerLevelTags,
} from '../utils/powerLevelTags';

export const usePowerLevelTags = (room: Room, powerLevels: IPowerLevels): PowerLevelTags => {
  const tagsEvent = useStateEvent(room, StateEvent.PowerLevelTags);
  // Developer tools show raw colour values as they are stored, for testing.
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  const powerLevelTags: PowerLevelTags = useMemo(
    () =>
      resolvePowerLevelTags(
        tagsEvent?.getContent<PowerLevelTags>() ?? {},
        powerLevels,
        developerTools
      ),
    [powerLevels, tagsEvent, developerTools]
  );

  return powerLevelTags;
};

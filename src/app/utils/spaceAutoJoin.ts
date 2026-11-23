import { Room } from 'matrix-js-sdk';
import { SpaceAutoJoinContent, StateEvent } from '../../types/matrix/room';
import { getStateEvent } from './room';

/**
 * Whether a space asks members' clients to auto-join its rooms. The current
 * event wins when present, so turning it off overrides a leftover legacy
 * `im.kibby` event; the legacy event is only read when there is no current one.
 */
export const getSpaceAutoJoin = (space: Room): boolean => {
  const current = getStateEvent(space, StateEvent.SpaceAutoJoin);
  const event = current ?? getStateEvent(space, StateEvent.LegacySpaceAutoJoin);
  return event?.getContent<SpaceAutoJoinContent>().auto_join === true;
};

export type AutoJoinAction = 'join' | 'settle' | 'skip';

/**
 * What auto-join does with a child room. A room is joined once: afterwards it is
 * settled, and a settled room we are not in was left on purpose. Joined rooms
 * not yet settled are recorded as such, so a later leave is remembered.
 */
export const getAutoJoinAction = (child: {
  joined: boolean;
  settled: boolean;
  leftExplicitly: boolean;
}): AutoJoinAction => {
  if (child.joined) return child.settled ? 'skip' : 'settle';
  return child.settled || child.leftExplicitly ? 'skip' : 'join';
};

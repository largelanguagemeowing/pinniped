import { M_POLL_END, type MatrixEvent } from 'matrix-js-sdk';
import { StateEvent } from '../../../types/matrix/room';
import { isMembershipChanged, reactionOrEditEvent } from '../../utils/room';

export type EventVisibilityOpts = {
  ignoredUsers: ReadonlySet<string>;
  showHiddenEvents: boolean;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  // whether the timeline has a dedicated renderer for this event type
  hasRenderer: (eventType: string) => boolean;
};

/**
 * Whether the timeline draws nothing for `mEvent`. The single source for that decision: the
 * renderer skips these events, and the window that follows the live end must not slide for them.
 * Encrypted events count as visible; what they decrypt to is only known to their renderer.
 */
export const isEventHidden = (mEvent: MatrixEvent, opts: EventVisibilityOpts): boolean => {
  const sender = mEvent.getSender();
  if (sender && opts.ignoredUsers.has(sender)) return true;
  if (mEvent.isRedacted() && !opts.showHiddenEvents) return true;
  if (reactionOrEditEvent(mEvent) || mEvent.isRedaction()) return true;

  const type = mEvent.getType();
  if (type === StateEvent.RoomMember) {
    return isMembershipChanged(mEvent) ? opts.hideMembershipEvents : opts.hideNickAvatarEvents;
  }
  if (M_POLL_END.matches(type)) return !mEvent.getRelation()?.event_id;
  if (type === StateEvent.GroupCallMemberPrefix) {
    // a call member event that only refreshes an existing membership
    return Boolean(mEvent.getContent().application && 'application' in mEvent.getPrevContent());
  }
  if (opts.hasRenderer(type)) return false;

  // generic renderers for events without a dedicated one
  if (!opts.showHiddenEvents) return true;
  if (typeof mEvent.getStateKey() === 'string') return false;
  return Object.keys(mEvent.getContent()).length === 0 || Boolean(mEvent.getRelation());
};

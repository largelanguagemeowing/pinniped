import { CallEmbed, emptyCallActivity, useCallActivity } from '../plugins/call';
import { useCallJoined } from './useCallEmbed';

/** Who in the call is speaking, muted or sharing their screen, once the call is joined. */
export const useCallParticipantActivity = (callEmbed?: CallEmbed) => {
  const joined = useCallJoined(callEmbed);
  const activity = useCallActivity(callEmbed);
  const { speakers, screenSharers, muted, deafened } = joined ? activity : emptyCallActivity;
  return { speakers, screenSharers, muted, deafened };
};

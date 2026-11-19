import type { Call } from '../plugins/call/Call';
import { constant } from '../plugins/call/engine/state/Behavior';
import {
  emptyParticipantActivity,
  type ParticipantActivity,
} from '../plugins/call/engine/state/CallViewModel/participantActivity';
import { useBehavior } from '../plugins/call/engine/useBehavior';

const noActivity$ = constant(emptyParticipantActivity);

/** Who in the call is speaking, muted, deafened or sharing their screen; nobody without a call. */
export const useCallParticipantActivity = (call?: Call): ParticipantActivity =>
  useBehavior(call?.vm.participantActivity$ ?? noActivity$);

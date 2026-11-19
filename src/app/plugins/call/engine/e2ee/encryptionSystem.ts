import { type Room } from 'matrix-js-sdk';

import { E2eeType } from './e2eeType';

export type Unencrypted = { kind: E2eeType.NONE };
export type PerParticipantE2EE = { kind: E2eeType.PER_PARTICIPANT };
export type EncryptionSystem = Unencrypted | PerParticipantE2EE;

/** Calls in encrypted rooms encrypt their media with per-participant keys sent over Matrix. */
export const roomEncryptionSystem = (room: Room): EncryptionSystem =>
  room.hasEncryptionStateEvent() ? { kind: E2eeType.PER_PARTICIPANT } : { kind: E2eeType.NONE };

import { AccountDataEvent } from '../../types/matrix/accountData';
import { createRoomMarks } from './roomMarks';

const settled = createRoomMarks(AccountDataEvent.PinnipedAutoJoinSettled);

/**
 * Records rooms space auto-join has handled: joined by it, or already joined when
 * it first saw them. It never joins such a room again, so leaving it on any
 * client (this one closed, or a different app) sticks. Synced via account data.
 */
export const markAutoJoinSettled = settled.mark;
export const useAutoJoinSettled = settled.useMarks;

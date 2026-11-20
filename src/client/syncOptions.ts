import type { IStartClientOpts } from 'matrix-js-sdk';
import { USER_PROFILE_FIELDS } from '../types/matrix/profile';

/** The options Pinniped starts the sync with; a fresh object, since the client keeps a reference. */
export const createSyncOptions = (): IStartClientOpts => ({
  lazyLoadMembers: true,
  unstableMSC4429SyncUserProfileFields: [...USER_PROFILE_FIELDS],
});

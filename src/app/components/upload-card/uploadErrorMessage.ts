import { UploadFailure } from '../../utils/uploadFailure';

/** What a failed upload says on its tile: the failure's own message, one per cause. */
export const getUploadErrorMessage = (error: UploadFailure): string => error.message;

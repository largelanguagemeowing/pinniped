import { MatrixError } from 'matrix-js-sdk';

/**
 * What a failed upload says on its tile. The seam for per-cause messages (size limit, rate limit,
 * network, authentication): the tile shows whatever this returns.
 */
export const getUploadErrorMessage = (error: MatrixError): string => error.message;

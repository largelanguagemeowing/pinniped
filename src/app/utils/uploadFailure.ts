import { ConnectionError, HTTPError, MatrixError, TokenRefreshLogoutError } from 'matrix-js-sdk';
import { isAbortError } from './abortError';

// Why an upload did not finish, as classes a caller can switch on by `kind`. Each carries the
// message to show and, as `cause`, the error it was made from.

export enum UploadFailureKind {
  TooLarge = 'too_large',
  RateLimited = 'rate_limited',
  Network = 'network',
  Auth = 'auth',
  Aborted = 'aborted',
  Other = 'other',
}

/** How long a rate limit asks to wait before the next try; a server does not have to say. */
export type RetryAfter = { kind: 'after'; ms: number } | { kind: 'unspecified' };

/** The file is over the upload limit of the homeserver or of a proxy in front of it. */
export class UploadTooLargeError extends Error {
  readonly kind = UploadFailureKind.TooLarge;

  constructor(cause: unknown) {
    super('The file is too large for this server', { cause });
    this.name = 'UploadTooLargeError';
  }
}

export class UploadRateLimitedError extends Error {
  readonly kind = UploadFailureKind.RateLimited;

  constructor(
    readonly retryAfter: RetryAfter,
    cause: unknown
  ) {
    super(
      retryAfter.kind === 'after'
        ? `Too many requests. Try again in ${Math.ceil(retryAfter.ms / 1000)} s`
        : 'Too many requests. Try again shortly',
      { cause }
    );
    this.name = 'UploadRateLimitedError';
  }
}

/** The request got no answer: offline, timed out, or the connection was cut. */
export class UploadNetworkError extends Error {
  readonly kind = UploadFailureKind.Network;

  constructor(cause: unknown) {
    super('The connection was lost while uploading', { cause });
    this.name = 'UploadNetworkError';
  }
}

/** The server no longer accepts this session. */
export class UploadAuthError extends Error {
  readonly kind = UploadFailureKind.Auth;

  constructor(cause: unknown) {
    super('This session is no longer signed in', { cause });
    this.name = 'UploadAuthError';
  }
}

/** The upload was cancelled from this client. */
export class UploadAbortedError extends Error {
  readonly kind = UploadFailureKind.Aborted;

  constructor(cause: unknown) {
    super('The upload was cancelled', { cause });
    this.name = 'UploadAbortedError';
  }
}

/** Anything else; the server's own explanation is shown when it gave one. */
export class UploadOtherError extends Error {
  readonly kind = UploadFailureKind.Other;

  constructor(cause: unknown) {
    super(
      cause instanceof MatrixError && cause.error
        ? `Upload failed: ${cause.error}`
        : 'Upload failed',
      { cause }
    );
    this.name = 'UploadOtherError';
  }
}

export type UploadFailure =
  | UploadTooLargeError
  | UploadRateLimitedError
  | UploadNetworkError
  | UploadAuthError
  | UploadAbortedError
  | UploadOtherError;

const retryAfterOf = (error: HTTPError): RetryAfter => {
  try {
    const ms = error.getRetryAfterMs();
    // a date that has passed gives a negative wait
    if (ms !== null) return { kind: 'after', ms: Math.max(0, ms) };
  } catch {
    // the server wrote the wait in a form the SDK rejects
  }
  return { kind: 'unspecified' };
};

/**
 * Classifies what `MatrixClient.uploadContent` rejected with. `aborted` says whether this client
 * cancelled the upload: the SDK rejects a cancelled upload and a request that got no answer with
 * the same error, so the rejection alone cannot tell them apart.
 */
export const toUploadFailure = (error: unknown, aborted: boolean): UploadFailure => {
  if (aborted) return new UploadAbortedError(error);
  // a server answer; without a Matrix error body when a proxy answered
  if (error instanceof HTTPError) {
    const errcode = error instanceof MatrixError ? error.errcode : undefined;
    if (errcode === 'M_TOO_LARGE' || error.httpStatus === 413) {
      return new UploadTooLargeError(error);
    }
    if (error.isRateLimitError()) return new UploadRateLimitedError(retryAfterOf(error), error);
    if (
      errcode === 'M_UNKNOWN_TOKEN' ||
      errcode === 'M_MISSING_TOKEN' ||
      error.httpStatus === 401
    ) {
      return new UploadAuthError(error);
    }
    return new UploadOtherError(error);
  }
  if (error instanceof TokenRefreshLogoutError) return new UploadAuthError(error);
  if (error instanceof ConnectionError || isAbortError(error)) return new UploadNetworkError(error);
  return new UploadOtherError(error);
};

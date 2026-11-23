/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MediaDeviceFailure } from 'livekit-client';

export enum ErrorCode {
  /**
   * Configuration problem due to no MatrixRTC backend/SFU is exposed via .well-known and no fallback configured.
   */
  MISSING_MATRIX_RTC_TRANSPORT = 'MISSING_MATRIX_RTC_TRANSPORT',
  CONNECTION_LOST_ERROR = 'CONNECTION_LOST_ERROR',
  INTERNAL_MEMBERSHIP_MANAGER = 'INTERNAL_MEMBERSHIP_MANAGER',
  FAILED_TO_START_LIVEKIT = 'FAILED_TO_START_LIVEKIT',
  /** LiveKit indicates that the server has hit its track limits */
  INSUFFICIENT_CAPACITY_ERROR = 'INSUFFICIENT_CAPACITY_ERROR',
  E2EE_NOT_SUPPORTED = 'E2EE_NOT_SUPPORTED',
  OPEN_ID_ERROR = 'OPEN_ID_ERROR',
  NO_MATRIX_2_AUTHORIZATION_SERVICE = 'NO_MATRIX_2_0_AUTHORIZATION_SERVICE',
  SFU_ERROR = 'SFU_ERROR',
  /** The JWT service gave us a token without the canPublish grant. */
  PUBLISH_NOT_ALLOWED = 'PUBLISH_NOT_ALLOWED',
  /** The browser or system refused, or could not provide, the microphone or camera. */
  MEDIA_DEVICE_ERROR = 'MEDIA_DEVICE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorCategory {
  /** Calling is not supported, server misconfigured (JWT service missing, no MSC support ...)*/
  CONFIGURATION_ISSUE = 'CONFIGURATION_ISSUE',
  NETWORK_CONNECTIVITY = 'NETWORK_CONNECTIVITY',
  CLIENT_CONFIGURATION = 'CLIENT_CONFIGURATION',
  UNKNOWN = 'UNKNOWN',
  SYSTEM_FAILURE = 'SYSTEM_FAILURE',
  // SYSTEM_FAILURE / FEDERATION_FAILURE ..
}

/**
 * Structure for errors that occur when using ElementCall.
 */
export class ElementCallError extends Error {
  public code: ErrorCode;
  public category: ErrorCategory;
  public localisedMessage?: string;
  public localisedTitle: string;

  protected constructor(
    localisedTitle: string,
    code: ErrorCode,
    category: ErrorCategory,
    localisedMessage?: string,
    cause?: Error
  ) {
    super(localisedTitle, { cause });
    this.localisedTitle = localisedTitle;
    this.localisedMessage = localisedMessage;
    this.category = category;
    this.code = code;
  }
}

/**
 * Configuration problem due to no MatrixRTC backend/SFU is exposed via .well-known and no fallback configured.
 */
export class MatrixRTCTransportMissingError extends ElementCallError {
  public domain: string;

  /**
   * Creates an instance of MatrixRTCTransportMissingError.
   * @param domain - The domain where the MatrixRTC transport is missing.
   */
  public constructor(domain: string) {
    super(
      'Call is not supported',
      ErrorCode.MISSING_MATRIX_RTC_TRANSPORT,
      ErrorCategory.CONFIGURATION_ISSUE,
      `Your homeserver is not set up for calls. Please contact your server admin (Domain: ${domain}, Error Code: ${ErrorCode.MISSING_MATRIX_RTC_TRANSPORT}).`
    );
    this.domain = domain;
  }
}

/**
 * Error indicating that the connection to the call was lost and could not be re-established.
 */
export class ConnectionLostError extends ElementCallError {
  public constructor() {
    super(
      'Connection lost',
      ErrorCode.CONNECTION_LOST_ERROR,
      ErrorCategory.NETWORK_CONNECTIVITY,
      'You were disconnected from the call.'
    );
  }
}

/**
 * Error indicating a failure in the membership manager causing the join call
 * operation to fail.
 */
export class MembershipManagerError extends ElementCallError {
  /**
   * Creates an instance of MembershipManagerError.
   *
   * @param error - The underlying error that caused the membership manager failure.
   */
  public constructor(error: Error) {
    super(
      'Membership Manager Error',
      ErrorCode.INTERNAL_MEMBERSHIP_MANAGER,
      ErrorCategory.SYSTEM_FAILURE,
      'The Membership Manager had to shut down. This is caused by many consecutive failed network requests.',
      error
    );
  }
}

/**
 * Error indicating that end-to-end encryption is not supported in the current environment.
 */
export class E2EENotSupportedError extends ElementCallError {
  public constructor() {
    super(
      'Incompatible browser',
      ErrorCode.E2EE_NOT_SUPPORTED,
      ErrorCategory.CLIENT_CONFIGURATION,
      'Your web browser does not support encrypted calls. Supported browsers include Chrome, Safari, and Firefox 117+.'
    );
  }
}

/**
 * Error indicating an unknown issue occurred during a call operation.
 */
export class UnknownCallError extends ElementCallError {
  /**
   * Creates an instance of UnknownCallError.
   * @param error - The underlying error that caused the unknown issue.
   */
  public constructor(error: Error) {
    super(
      'Something went wrong',
      ErrorCode.UNKNOWN_ERROR,
      ErrorCategory.UNKNOWN,
      undefined,
      // Properly set it as a cause for a better reporting on sentry
      error
    );
  }
}

/**
 * Error indicating a failure to obtain an OpenID token.
 */
export class FailToGetOpenIdToken extends ElementCallError {
  /**
   * Creates an instance of FailToGetOpenIdToken.
   * @param error - The underlying error that caused the failure.
   */
  public constructor(error: Error) {
    super(
      'Something went wrong',
      ErrorCode.OPEN_ID_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      undefined,
      // Properly set it as a cause for a better reporting on sentry
      error
    );
  }
}

export class NoMatrix2AuthorizationService extends ElementCallError {
  /**
   * Creates an instance of NoMatrix2_0AuthorizationService.
   * @param error - The underlying error that caused the failure.
   */
  public constructor(error: Error) {
    super(
      'Something went wrong',
      ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE,
      ErrorCategory.CONFIGURATION_ISSUE,
      'The authorization service for your media server (SFU) is out of date.',
      // Properly set it as a cause for a better reporting on sentry
      error
    );
  }
}

/**
 * Error indicating a failure to start publishing on a LiveKit connection.
 */
export class FailToStartLivekitConnection extends ElementCallError {
  /**
   * Creates an instance of FailToStartLivekitConnection.
   * @param e - An optional error message providing additional context.
   */
  public constructor(e?: string) {
    super(
      'Failed to start Livekit connection',
      ErrorCode.FAILED_TO_START_LIVEKIT,
      ErrorCategory.NETWORK_CONNECTIVITY,
      e
    );
  }
}

/**
 * Error indicating that a LiveKit's server has hit its track limits.
 */
export class InsufficientCapacityError extends ElementCallError {
  public constructor() {
    super(
      'Insufficient capacity',
      ErrorCode.INSUFFICIENT_CAPACITY_ERROR,
      ErrorCategory.UNKNOWN,
      'The server has reached its maximum capacity and you cannot join the call at this time. Try again later, or contact your server admin if the problem persists.'
    );
  }
}

/**
 * Error indicating that room creation is restricted by the SFU.
 * Only authorized users can create rooms, so the room must exist before connecting (done by the auth jwt service)
 */
export class SFURoomCreationRestrictedError extends ElementCallError {
  public constructor() {
    super(
      'Failed to create call',
      ErrorCode.SFU_ERROR,
      ErrorCategory.CONFIGURATION_ISSUE,
      'Call creation might be restricted to authorized users only. Try again later, or contact your server admin if the problem persists.'
    );
  }
}

/**
 * The media server's JWT service let us join without permission to publish,
 * typically because it only serves users of homeservers it trusts. We can hear
 * the call but nobody hears or sees us.
 */
export class PublishNotAllowedError extends ElementCallError {
  public readonly server: string;

  public constructor(server: string) {
    super(
      'You can listen but not speak',
      ErrorCode.PUBLISH_NOT_ALLOWED,
      ErrorCategory.CONFIGURATION_ISSUE,
      `The media server ${server} does not let users of your homeserver send audio or video. Its admin has to add your homeserver to its trusted list.`
    );
    this.server = server;
  }
}

const MEDIA_DEVICE_TEXT: Record<MediaDeviceFailure, { title: string; message: string }> = {
  [MediaDeviceFailure.PermissionDenied]: {
    title: 'Access to your {device} is blocked',
    message: 'Allow it in your browser or system settings, then turn it on again.',
  },
  [MediaDeviceFailure.NotFound]: {
    title: 'No {device} found',
    message: 'Connect one, then turn it on again.',
  },
  [MediaDeviceFailure.DeviceInUse]: {
    title: 'Your {device} is in use by another app',
    message: 'Close the other app, then turn it on again.',
  },
  [MediaDeviceFailure.Other]: {
    title: 'Could not start your {device}',
    message: 'Check it is connected and allowed, then turn it on again.',
  },
};

/**
 * The microphone or camera could not be started, so nothing of that kind is
 * published even though the call looks connected.
 */
export class MediaDeviceError extends ElementCallError {
  public readonly kind: 'audioinput' | 'videoinput';

  public constructor(failure: MediaDeviceFailure, kind: 'audioinput' | 'videoinput') {
    const device = kind === 'audioinput' ? 'microphone' : 'camera';
    const text = MEDIA_DEVICE_TEXT[failure];
    super(
      text.title.replace('{device}', device),
      ErrorCode.MEDIA_DEVICE_ERROR,
      ErrorCategory.CLIENT_CONFIGURATION,
      `Others cannot ${kind === 'audioinput' ? 'hear' : 'see'} you. ${text.message}`
    );
    this.kind = kind;
  }
}

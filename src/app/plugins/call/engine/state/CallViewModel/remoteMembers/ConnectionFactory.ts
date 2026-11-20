/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Room as LivekitRoom,
  type RoomOptions,
  type BaseKeyProvider,
  type E2EEManagerOptions,
  type BaseE2EEManager,
} from 'livekit-client';
import { type Logger } from 'matrix-js-sdk/lib/logger';
// imported as inline to support worker when loaded from a cdn (cross domain)
import E2EEWorker from 'livekit-client/e2ee-worker?worker&inline';
import { type CallMembershipIdentityParts } from 'matrix-js-sdk/lib/matrixrtc/EncryptionManager';
import { type LivekitTransport } from 'matrix-js-sdk/lib/matrixrtc';

import { type ObservableScope } from '../../ObservableScope';
import { Connection } from './Connection';
import type { OpenIDClientParts, SFUConfig } from '../../../livekit/openIDSFU';
import type { MediaDevices } from '../../MediaDevices';
import { defaultLiveKitOptions } from '../../../livekit/options';

// TODO evaluate if this should be done like the Publisher Factory
export interface ConnectionFactory {
  createConnection(
    scope: ObservableScope,
    transport: LivekitTransport,
    ownMembershipIdentity: CallMembershipIdentityParts,
    logger: Logger,
    sfuConfig?: SFUConfig,
    refreshSFUConfig?: () => Promise<SFUConfig>
  ): Connection;
}

export class ECConnectionFactory implements ConnectionFactory {
  private readonly livekitRoomFactory: () => LivekitRoom;

  /**
   * Creates a ConnectionFactory for LiveKit connections.
   *
   * @param client - The OpenID client parts for authentication, needed to get openID and JWT tokens.
   * @param roomId - The current room ID.
   * @param devices - Used for the video and audio capture options.
   * @param livekitKeyProvider - Optional key provider for end-to-end encryption.
   * @param livekitRoomFactory - Optional factory function (for testing) to create LivekitRoom instances. If not provided, a default factory is used.
   */
  public constructor(
    private client: OpenIDClientParts,
    private readonly roomId: string,
    private devices: MediaDevices,
    livekitKeyProvider: BaseKeyProvider | undefined,
    livekitRoomFactory?: () => LivekitRoom
  ) {
    const defaultFactory = (): LivekitRoom =>
      new LivekitRoom(
        generateRoomOption({
          devices: this.devices,
          e2eeLivekitOptions: livekitKeyProvider && {
            keyProvider: livekitKeyProvider,
            // It's important that every room use a separate E2EE worker.
            // They get confused if given streams from multiple rooms.
            worker: new E2EEWorker(),
          },
        })
      );
    this.livekitRoomFactory = livekitRoomFactory ?? defaultFactory;
  }

  /**
   *
   * @param scope The observable scope (used for clean-up)
   * @param transport The transport to use for this connection.
   * @param ownMembershipIdentity required to connect (using the jwt service) with the SFU.
   * @param logger The logger instance to use for this connection.
   * @param sfuConfig optional config in case we already have a token for this connection.
   * @param refreshSFUConfig optional way to get a fresh token when rejoining after a drop.
   * @returns
   */
  public createConnection(
    scope: ObservableScope,
    transport: LivekitTransport,
    ownMembershipIdentity: CallMembershipIdentityParts,
    logger: Logger,
    sfuConfig?: SFUConfig,
    refreshSFUConfig?: () => Promise<SFUConfig>
  ): Connection {
    return new Connection(
      {
        existingSFUConfig: sfuConfig,
        refreshSFUConfig,
        roomId: this.roomId,
        transport,
        client: this.client,
        scope: scope,
        livekitRoomFactory: this.livekitRoomFactory,
        ownMembershipIdentity,
      },
      logger
    );
  }
}

/**
 *  Generate the initial LiveKit RoomOptions based on the current media devices.
 */
function generateRoomOption({
  devices,
  e2eeLivekitOptions,
}: {
  devices: MediaDevices;
  e2eeLivekitOptions: E2EEManagerOptions | { e2eeManager: BaseE2EEManager } | undefined;
}): RoomOptions {
  // The mic is always captured raw: the browser's noise suppression and AGC
  // (both of which sound bad and gate noise on/off) are replaced by the fork's
  // own pipeline. Echo cancellation stays with the browser, which has the
  // far-end reference signal.
  return {
    ...defaultLiveKitOptions,
    videoCaptureDefaults: {
      ...defaultLiveKitOptions.videoCaptureDefaults,
      deviceId: devices.videoInput.selected$.value?.id,
    },
    audioCaptureDefaults: {
      ...defaultLiveKitOptions.audioCaptureDefaults,
      deviceId: devices.audioInput.selected$.value?.id,
      echoCancellation: true,
      autoGainControl: false,
      noiseSuppression: false,
    },
    e2ee: e2eeLivekitOptions,
    // TODO test and consider this:
    // webAudioMix: true,
  };
}

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Participant,
  ParticipantEvent,
  type LocalParticipant,
  type ScreenShareCaptureOptions,
  type LocalAudioTrack,
  type LocalTrackPublication,
  createLocalAudioTrack,
  Track,
  RoomEvent,
  MediaDeviceFailure,
} from 'livekit-client';
import { observeParticipantEvents } from '@livekit/components-core';
import { DEAFENED_ATTRIBUTE } from '../../../livekit/deafened';
import {
  MatrixRTCSessionEvent,
  MembershipManagerEvent,
  Status as RTCSessionStatus,
  type LivekitTransport,
  type MatrixRTCSession,
} from 'matrix-js-sdk/lib/matrixrtc';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  from,
  fromEvent,
  map,
  merge,
  type Observable,
  of,
  pairwise,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { type Logger } from 'matrix-js-sdk/lib/logger';
import { deepCompare } from 'matrix-js-sdk/lib/utils';
import { type CallMembershipIdentityParts } from 'matrix-js-sdk/lib/matrixrtc/EncryptionManager';

import { type Behavior } from '../../Behavior';
import { type IConnectionManager } from '../remoteMembers/ConnectionManager';
import { type ObservableScope } from '../../ObservableScope';
import { type Publisher } from './Publisher';
import { type MuteStates } from '../../MuteStates';
import {
  ElementCallError,
  FailToStartLivekitConnection,
  MediaDeviceError,
  MembershipManagerError,
  PublishNotAllowedError,
  UnknownCallError,
} from '../../../utils/errors';
import { MatrixRTCMode } from '../matrixRTCMode';
import { type RTCCallIntent, type RTCNotificationType } from 'matrix-js-sdk/lib/matrixrtc';
import {
  DELAYED_LEAVE_EVENT_DELAY_MS,
  NETWORK_ERROR_RETRY_MS,
  SYNC_DISCONNECT_GRACE_PERIOD_MS,
} from '../../../config';
import {
  screenShareBudget,
  screenShareContentHints,
  screenShareEncoding,
} from '../../../livekit/options';
import { callSettings } from '../../../settings';
import {
  ConnectionState,
  type Connection,
  type FailedToStartError,
} from '../remoteMembers/Connection';
import { type HomeserverConnected } from './HomeserverConnected';
import { type LocalTransport } from './LocalTransport';
import { areLivekitTransportsEqual } from '../remoteMembers/MatrixLivekitMembers';
import { PcmAudioSource } from '../../../livekit/shareAudio';

/** Backoff for rejoining the MatrixRTC session after the membership manager gave up. */
const MEMBERSHIP_REJOIN_BASE_DELAY_MS = 1_000;
const MEMBERSHIP_REJOIN_MAX_DELAY_MS = 15_000;
/** How long to keep trying before telling the user the call is lost. */
const MEMBERSHIP_REJOIN_TIMEOUT_MS = 5 * 60_000;

export enum TransportState {
  /** Not even a transport is available to the LocalMembership */
  Waiting = 'transport_waiting',
}

export enum PublishState {
  WaitingForUser = 'publish_waiting_for_user',
  // XXX: This state is removed for now since we do not have full control over
  // track publication anymore with the publisher abstraction, might come back in the future?
  // /** Implies lk connection is connected */
  // Starting = "publish_start_publishing",
  /** Implies lk connection is connected */
  Publishing = 'publish_publishing',
}

// TODO not sure how to map that correctly with the
// new publisher that does not manage tracks itself anymore
export enum TrackState {
  /** The track is waiting for user input to create tracks (waiting to call `startTracks()`) */
  WaitingForUser = 'tracks_waiting_for_user',
  // XXX: This state is removed for now since we do not have full control over
  // track creation anymore with the publisher abstraction, might come back in the future?
  // /** Implies lk connection is connected */
  // Creating = "tracks_creating",
  /** Implies lk connection is connected */
  Ready = 'tracks_ready',
}

export type LocalMemberMediaState =
  | {
      tracks: TrackState;
      connection: ConnectionState | FailedToStartError;
    }
  | PublishState
  | ElementCallError;
export type LocalMemberState =
  | ElementCallError
  | TransportState.Waiting
  | {
      media: LocalMemberMediaState;
      matrix: ElementCallError | RTCSessionStatus;
    };

/*
 * - get well known
 * - get oldest membership
 * - get transport to use
 * - get openId + jwt token
 * - wait for createTrack() call
 *    - create tracks
 * - wait for join() call
 *   - Publisher.publishTracks()
 *   - send join state/sticky event
 */

interface Props {
  // TODO add a comment into some code style readme or file header callviewmodel
  // that the inputs for those createSomething$() functions should NOT contain any js-sdk objectes
  scope: ObservableScope;
  muteStates: MuteStates;
  connectionManager: IConnectionManager;
  createPublisherFactory: (connection: Connection) => Publisher;
  joinMatrixRTC: (transport: LivekitTransport) => void;
  homeserverConnected: HomeserverConnected;
  localTransport$: Behavior<LocalTransport>;
  matrixRTCSession: Pick<MatrixRTCSession, 'updateCallIntent' | 'leave' | 'on' | 'off'>;
  logger: Logger;
}

/**
 * This class is responsible for managing the own membership in a room.
 * We want
 *  - a publisher
 *  -
 * @param props The properties required to create the local membership.
 * @param props.scope The observable scope to use.
 * @param props.connectionManager The connection manager to get connections from.
 * @param props.createPublisherFactory Factory to create a publisher once we have a connection.
 * @param props.joinMatrixRTC Callback to join the matrix RTC session once we have a transport.
 * @param props.homeserverConnected The homeserver connected state.
 * @param props.localTransport$ The transport to advertise in our membership.
 * @param props.logger The logger to use.
 * @param props.muteStates The mute states for video and audio.
 * @param props.matrixRTCSession The matrix RTC session to join.
 * @returns
 *  - publisher: The handle to create tracks and publish them to the room.
 *  - connected$: the current connection state. Including matrix server and livekit server connection. (only considering the livekit server we are using for our own media publication)
 *  - transport$: the transport object the ownMembership$ ended up using.
 *  - connectionState: the current connection state. Including matrix server and livekit server connection.
 *  - sharingScreen$: Whether we are sharing our screen. `undefined` if we cannot share the screen.
 */
export const createLocalMembership$ = ({
  scope,
  connectionManager,
  localTransport$,
  homeserverConnected,
  createPublisherFactory,
  joinMatrixRTC,
  logger: parentLogger,
  muteStates,
  matrixRTCSession,
}: Props): {
  /**
   * This request to start audio and video tracks.
   * Can be called early to pre-emptively get media permissions and start devices.
   */
  startTracks: () => void;
  /**
   * This sets a inner state (shouldPublish) to true and instructs the js-sdk and livekit to keep the user
   * connected to matrix and livekit.
   */
  requestJoinAndPublish: () => void;
  requestDisconnect: () => void;
  localMemberState$: Behavior<LocalMemberState>;
  /**
   * Why we cannot send audio or video, if we cannot. Not fatal: we can still
   * hear the call.
   */
  publishError$: Behavior<ElementCallError | null>;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  /** Starts a screen share with the quality and audio in the call settings, unless one runs. */
  startScreenShare: () => void;
  stopScreenShare: () => void;
  /** Screen share audio for the `pcm` source: interleaved stereo 16-bit little-endian PCM, 48 kHz. */
  pushShareAudio: (chunk: Uint8Array) => void;
  // tracks$: Behavior<LocalTrack[]>;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
  /**
   * Tracks the homserver and livekit connected state and based on that computes reconnecting.
   */
  reconnecting$: Behavior<boolean>;
  /** Shorthand for homeserverConnected.rtcSession === Status.Disconnected
   * Direct translation to the js-sdk membership manager connection `Status`.
   */
  disconnected$: Behavior<boolean>;
  /**
   * Fully connected
   */
  connected$: Behavior<boolean>;
  internalLoggerRef: Logger;
} => {
  const logger = parentLogger.getChild('[LocalMembership]');
  logger.debug(`Creating local membership..`);

  // We consider error on the transport as fatal.
  // Whether it is the active transport or the preferred transport.
  const handleTransportError = (e: unknown): Observable<null> => {
    let error: ElementCallError;
    if (e instanceof ElementCallError) {
      error = e;
    } else {
      error = new UnknownCallError(
        e instanceof Error ? e : new Error('Unknown error from localTransport')
      );
    }
    setTransportError(error);
    return of(null);
  };

  // This is the transport that we will advertise in our membership.
  const advertisedTransport$ = localTransport$.pipe(
    switchMap((lt) => lt.advertised$),
    catchError(handleTransportError),
    distinctUntilChanged(areLivekitTransportsEqual)
  );

  // Unwrap the local transport and set the state of the LocalMembership to error in case the transport is an error.
  const activeTransport$ = scope.behavior(
    localTransport$.pipe(
      switchMap((lt) => {
        return combineLatest([lt.active$, lt.advertised$]).pipe(
          map(([active, advertised]) => {
            // Our policy is to not publish to another transport if our prefered transport is miss-configured
            if (advertised == null) return null;

            return active?.transport ?? null;
          })
        );
      }),
      catchError(handleTransportError),
      distinctUntilChanged(areLivekitTransportsEqual)
    )
  );

  // Drop Epoch data here since we will not combine this anymore
  const localConnection$ = scope.behavior(
    combineLatest([connectionManager.connectionManagerData$, activeTransport$]).pipe(
      map(([{ value: connectionData }, localTransport]) => {
        if (localTransport === null) {
          return null;
        }

        return connectionData.getConnectionForTransport(localTransport);
      }),
      tap((connection) => {
        logger.info(`Local connection updated: ${connection?.transport?.livekit_service_url}`);
      })
    )
  );

  // MATRIX RELATED

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const trackStartRequested = Promise.withResolvers<void>();

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const joinAndPublishRequested$ = new BehaviorSubject(false);

  /**
   * The publisher is stored in here an abstracts creating and publishing tracks.
   */
  const publisher$ = new BehaviorSubject<Publisher | null>(null);

  const startTracks = (): void => {
    trackStartRequested.resolve();
    // This used to return the tracks, but now they are only accessible via the publisher.
  };

  const requestJoinAndPublish = (): void => {
    trackStartRequested.resolve();
    joinAndPublishRequested$.next(true);
  };

  const requestDisconnect = (): void => {
    joinAndPublishRequested$.next(false);
  };

  // Take care of the publisher$
  // create a new one as soon as a local Connection is available
  //
  // Recreate a new one once the local connection changes
  //  - stop publishing
  //  - destruct all current streams
  //  - overwrite current publisher
  scope.reconcile(localConnection$, async (connection) => {
    logger.info(
      'reconcile based on new localConnection:',
      connection?.transport.livekit_service_url
    );
    if (connection !== null) {
      const publisher = createPublisherFactory(connection);
      publisher$.next(publisher);

      // Clean-up callback
      return Promise.resolve(async (): Promise<void> => {
        await publisher.destroy();
      });
    }
  });

  // Use reconcile here to not run concurrent createAndSetupTracks calls
  // `tracks$` will update once they are ready.
  scope.reconcile(
    scope.behavior(
      combineLatest([publisher$ /*, tracks$*/, from(trackStartRequested.promise)]),
      null
    ),
    async (valueIfReady) => {
      if (!valueIfReady) return;
      const [publisher] = valueIfReady;
      if (publisher) {
        await publisher.createAndSetupTracks().catch((e) => logger.error(e));
      }
    }
  );

  // Based on `connectRequested$` we start publishing tracks. (once they are there!)
  scope.reconcile(
    scope.behavior(combineLatest([publisher$, joinAndPublishRequested$])),
    async ([publisher, shouldJoinAndPublish]) => {
      // Get the current publishing state to avoid redundant calls.
      const isPublishing = publisher?.shouldPublish === true;
      if (shouldJoinAndPublish && !isPublishing) {
        try {
          await publisher?.startPublishing();
          clearPublishError('publishing');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setPublishError('publishing', new FailToStartLivekitConnection(message));
        }
      } else if (isPublishing) {
        try {
          await publisher?.stopPublishing();
        } catch (error) {
          setPublishError('publishing', new UnknownCallError(error as Error));
        }
      }
    }
  );

  // STATE COMPUTATION

  // These are non fatal since we can join a room and concume media even though publishing failed.
  // Each failing condition has its own slot, so a later failure never hides an earlier one and
  // each clears once its own condition recovers. The most severe one is shown.
  type PublishErrorSlot = 'denied' | 'publishing' | 'audioinput' | 'videoinput';
  const SLOTS_BY_SEVERITY: PublishErrorSlot[] = [
    'denied',
    'publishing',
    'audioinput',
    'videoinput',
  ];
  const publishErrors = new Map<PublishErrorSlot, ElementCallError>();
  const publishError$ = new BehaviorSubject<ElementCallError | null>(null);
  const updatePublishError = (): void => {
    const slot = SLOTS_BY_SEVERITY.find((s) => publishErrors.has(s));
    const shown = (slot && publishErrors.get(slot)) ?? null;
    if (shown !== publishError$.value) publishError$.next(shown);
  };
  const setPublishError = (slot: PublishErrorSlot, e: ElementCallError): void => {
    publishErrors.set(slot, e);
    updatePublishError();
  };
  const clearPublishError = (slot: PublishErrorSlot): void => {
    publishErrors.delete(slot);
    updatePublishError();
  };

  // Pinniped: the JWT service decides whether we may publish (LiveKit's
  // canPublish grant), and usually only grants it to users of homeservers it
  // trusts. Without it LiveKit rejects every track, so tell the user instead of
  // leaving them in a call where nobody hears them.
  localConnection$
    .pipe(
      switchMap((connection) => {
        if (!connection) return of(null);
        const room = connection.livekitRoom;
        // The room re-emits the local participant's permission changes.
        return merge(
          fromEvent(room, RoomEvent.Connected),
          fromEvent(room, RoomEvent.ParticipantPermissionsChanged)
        ).pipe(
          startWith(undefined),
          map(() =>
            // `permissions` is absent in test mocks
            room.localParticipant?.permissions?.canPublish === false
              ? new URL(connection.transport.livekit_service_url).host
              : null
          )
        );
      }),
      distinctUntilChanged(),
      scope.bind()
    )
    .subscribe((deniedBy) => {
      if (deniedBy !== null) {
        logger.error(`Media server ${deniedBy} does not allow us to publish`);
        setPublishError('denied', new PublishNotAllowedError(deniedBy));
      } else {
        clearPublishError('denied');
      }
    });

  // The microphone or camera could not be started. Not fatal (the call works without
  // media), but nothing is published, so say so. Screen share failures carry no kind
  // (cancelling the browser prompt is one), and are left out.
  localConnection$
    .pipe(
      switchMap((connection) =>
        connection
          ? fromEvent(
              connection.livekitRoom,
              RoomEvent.MediaDevicesError,
              (error: Error, kind?: MediaDeviceKind) => ({ error, kind })
            )
          : EMPTY
      ),
      scope.bind()
    )
    .subscribe(({ error, kind }) => {
      logger.error('Failed to create local tracks:', error);
      if (kind !== 'audioinput' && kind !== 'videoinput') return;
      const failure = MediaDeviceFailure.getFailure(error) ?? MediaDeviceFailure.Other;
      setPublishError(kind, new MediaDeviceError(failure, kind));
    });

  // Once that kind of track is published the problem is gone.
  localConnection$
    .pipe(
      switchMap((connection) =>
        connection
          ? fromEvent(
              connection.livekitRoom,
              RoomEvent.LocalTrackPublished,
              (publication: LocalTrackPublication) => publication.source
            )
          : EMPTY
      ),
      scope.bind()
    )
    .subscribe((source) => {
      if (source === Track.Source.Microphone) clearPublishError('audioinput');
      if (source === Track.Source.Camera) clearPublishError('videoinput');
    });

  const fatalTransportError$ = new BehaviorSubject<ElementCallError | null>(null);

  const setTransportError = (e: ElementCallError): void => {
    if (fatalTransportError$.value !== null) {
      logger.error('Multiple Transport Errors:', e);
    } else {
      fatalTransportError$.next(e);
    }
  };

  const localConnectionState$ = localConnection$.pipe(
    switchMap((connection) => (connection ? connection.state$ : of(null)))
  );

  const mediaState$: Behavior<LocalMemberMediaState> = scope.behavior(
    combineLatest([
      localConnectionState$,
      activeTransport$,
      joinAndPublishRequested$,
      from(trackStartRequested.promise).pipe(
        map(() => true),
        startWith(false)
      ),
    ]).pipe(
      map(([localConnectionState, localTransport, shouldPublish, shouldStartTracks]) => {
        if (!localTransport) return null;
        const trackState: TrackState = shouldStartTracks
          ? TrackState.Ready
          : TrackState.WaitingForUser;

        if (
          localConnectionState !== ConnectionState.LivekitConnected ||
          trackState !== TrackState.Ready
        )
          return {
            connection: localConnectionState,
            tracks: trackState,
          };
        if (!shouldPublish) return PublishState.WaitingForUser;
        // if (!publishing) return PublishState.Starting;
        return PublishState.Publishing;
      }),
      distinctUntilChanged(deepCompare)
    )
  );
  const fatalMatrixError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setMatrixError = (e: ElementCallError): void => {
    if (fatalMatrixError$.value !== null) {
      logger.error('Multiple Matrix Errors:', e);
    } else {
      fatalMatrixError$.next(e);
    }
  };

  const localMemberState$ = scope.behavior<LocalMemberState>(
    combineLatest([
      mediaState$,
      homeserverConnected.rtsSession$,
      fatalMatrixError$,
      fatalTransportError$,
    ]).pipe(
      map(([mediaState, rtcSessionStatus, fatalMatrixError, fatalTransportError]) => {
        if (fatalTransportError !== null) return fatalTransportError;
        // `mediaState` will be 'null' until the transport/connection appears.
        if (mediaState && rtcSessionStatus)
          return {
            matrix: fatalMatrixError ?? rtcSessionStatus,
            media: mediaState,
          };
        return TransportState.Waiting;
      })
    )
  );

  /**
   * The disconnect reason for the combined Matrix + LiveKit connection, or null
   * when fully connected. Homeserver reasons take priority over livekit.
   * Both connectivity state and reason come from the same combineLatest emission,
   * avoiding any race between the two.
   */
  const connectionDisconnectReason$ = scope.behavior(
    combineLatest([
      homeserverConnected.combined$,
      localConnectionState$.pipe(map((state) => state === ConnectionState.LivekitConnected)),
    ]).pipe(
      map(([[hsConnected, hsReason], livekitConnected]) => {
        if (!hsConnected) return hsReason!;
        if (!livekitConnected) return 'livekit' as const;
        return null;
      }),
      tap((v) => logger.debug('livekit+matrix: Connected state changed', v))
    )
  );

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  const matrixAndLivekitConnected$ = scope.behavior(
    connectionDisconnectReason$.pipe(map((reason) => reason === null))
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  const reconnecting$ = scope.behavior(
    matrixAndLivekitConnected$.pipe(
      pairwise(),
      map(([prev, current]) => prev === true && current === false)
    ),
    false
  );

  muteStates.video.enabled$.pipe(scope.bind()).subscribe((videoEnabled) => {
    void matrixRTCSession.updateCallIntent(videoEnabled ? 'video' : 'audio').catch((e) => {
      if (e instanceof Error && e.message === 'Not connected yet') {
        logger.debug(
          "'not connected yet' while updating the call intent (this is expected on startup)"
        );
      } else {
        throw e;
      }
    });
  });

  // Keep matrix rtc session in sync with advertisedTransport$, connectRequested$
  scope.reconcile(
    scope.behavior(combineLatest([advertisedTransport$, joinAndPublishRequested$])),
    async ([transport, shouldConnect]) => {
      if (!transport) return;
      // if shouldConnect=false we will do the disconnect as the cleanup from the previous reconcile iteration.
      if (!shouldConnect) return;

      try {
        joinMatrixRTC(transport);
      } catch (error) {
        logger.error('Error entering RTC session', error);
        if (error instanceof Error) setMatrixError(new MembershipManagerError(error));
      }

      // The membership manager gives up after about the delayed-leave delay,
      // and by then the homeserver has removed our membership as well. If the
      // homeserver was only briefly unavailable (e.g. a node drain), we are
      // still in the SFU but invisible to everyone else. Keep trying to join
      // again with backoff, and only report the error if it stays down.
      let rejoinCancelled = false;
      let rejoinTimer: ReturnType<typeof setTimeout> | undefined;
      let rejoinAttempts = 0;
      let rejoinStartedAt: number | undefined;
      const onMembershipManagerError = (error: unknown): void => {
        rejoinStartedAt ??= Date.now();
        if (Date.now() - rejoinStartedAt > MEMBERSHIP_REJOIN_TIMEOUT_MS) {
          logger.error('Giving up rejoining the MatrixRTC session', error);
          setMatrixError(
            new MembershipManagerError(error instanceof Error ? error : new Error(String(error)))
          );
          return;
        }
        const delay = Math.min(
          MEMBERSHIP_REJOIN_BASE_DELAY_MS * 2 ** rejoinAttempts++,
          MEMBERSHIP_REJOIN_MAX_DELAY_MS
        );
        logger.warn(
          `Membership manager failed, rejoining the MatrixRTC session in ${delay}ms (attempt ${rejoinAttempts})`,
          error
        );
        clearTimeout(rejoinTimer);
        rejoinTimer = setTimeout(() => {
          if (rejoinCancelled) return;
          try {
            // Throws or errors again via the event if the homeserver is
            // still unreachable, which schedules the next attempt.
            joinMatrixRTC(transport);
          } catch (e) {
            onMembershipManagerError(e);
          }
        }, delay);
      };
      const onMembershipStatusChanged = (
        _old: RTCSessionStatus,
        status: RTCSessionStatus
      ): void => {
        if (status !== RTCSessionStatus.Connected) return;
        rejoinAttempts = 0;
        rejoinStartedAt = undefined;
      };
      matrixRTCSession.on(MatrixRTCSessionEvent.MembershipManagerError, onMembershipManagerError);
      matrixRTCSession.on(MembershipManagerEvent.StatusChanged, onMembershipStatusChanged);

      return Promise.resolve(async (): Promise<void> => {
        rejoinCancelled = true;
        clearTimeout(rejoinTimer);
        matrixRTCSession.off(
          MatrixRTCSessionEvent.MembershipManagerError,
          onMembershipManagerError
        );
        matrixRTCSession.off(MembershipManagerEvent.StatusChanged, onMembershipStatusChanged);
        try {
          // TODO Update matrixRTCSession to allow udpating the transport without leaving the session!
          await matrixRTCSession.leave(1000);
        } catch (e) {
          logger.error('Error leaving RTC session', e);
        }
      });
    }
  );

  const participant$ = scope.behavior(
    localConnection$.pipe(
      map((c) => c?.livekitRoom?.localParticipant ?? null),
      tap((p) => {
        logger.debug('participant$ updated:', p?.identity);
      })
    )
  );

  // Share whether this client is deafened, so other participants can show it. Client-reported.
  // A new LiveKit session starts without attributes, so it is sent again whenever the
  // connection (re)connects, not only when the state changes.
  const livekitConnected$ = localConnectionState$.pipe(
    map((state) => state === ConnectionState.LivekitConnected),
    distinctUntilChanged()
  );
  combineLatest([participant$, muteStates.deafened$, livekitConnected$])
    .pipe(scope.bind())
    .subscribe(([p, deafened, connected]) => {
      if (!p || !connected) return;
      p.setAttributes({ [DEAFENED_ATTRIBUTE]: String(deafened) }).catch((e) =>
        logger.error('Failed to share the deafened state', e)
      );
    });

  // Pause upstream of all local media tracks when we're disconnected from
  // MatrixRTC, because it can be an unpleasant surprise for the app to say
  // 'reconnecting' and yet still be transmitting your media to others.
  // We use matrixConnected$ rather than reconnecting$ because we want to
  // pause tracks during the initial joining sequence too until we're sure
  // that our own media is displayed on screen.
  // TODO refactor this based no livekitState$
  combineLatest([participant$, homeserverConnected.combined$])
    .pipe(scope.bind())
    .subscribe(([participant, [connected]]) => {
      if (!participant) return;
      const publications = participant.trackPublications.values();
      if (connected) {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === true) {
            const kind = p.track.kind;
            logger.info(`Resuming ${kind} track (MatrixRTC connection present)`);
            p.track
              .resumeUpstream()
              .catch((e) =>
                logger.error(`Failed to resume ${kind} track after MatrixRTC reconnection`, e)
              );
          }
        }
      } else {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === false) {
            const kind = p.track.kind;
            logger.info(`Pausing ${kind} track (uncertain MatrixRTC connection)`);
            p.track
              .pauseUpstream()
              .catch((e) =>
                logger.error(
                  `Failed to pause ${kind} track after entering uncertain MatrixRTC connection`,
                  e
                )
              );
          }
        }
      }
    });

  /**
   * Whether the user is currently sharing their screen.
   */
  const sharingScreen$ = scope.behavior(
    participant$.pipe(switchMap((p) => (p !== null ? observeSharingScreen$(p) : of(false))))
  );

  // A microphone published as the share's audio, when the client asks for one
  // (the capture itself has no system audio there, see the setting).
  let shareAudioTrack: LocalAudioTrack | null = null;
  // The `pcm` source: audio the client captures itself and sends in chunks.
  let pcmShareAudio: PcmAudioSource | null = null;
  const stopShareAudio = (): void => {
    const track =
      shareAudioTrack ??
      participant$.value?.getTrackPublication(Track.Source.ScreenShareAudio)?.track;
    shareAudioTrack = null;
    const pcm = pcmShareAudio;
    pcmShareAudio = null;
    pcm?.close().catch(logger.error);
    if (track === undefined || track === null) return;
    participant$.value?.unpublishTrack(track, true).catch(logger.error);
    track.stop();
  };
  const startPcmShareAudio = async (): Promise<void> => {
    const source = await PcmAudioSource.create();
    // The share may have ended while the player was starting.
    if (!sharingScreen$.value || pcmShareAudio !== null) {
      source.close().catch(logger.error);
      return;
    }
    pcmShareAudio = source;
    await participant$.value?.publishTrack(source.track, {
      source: Track.Source.ScreenShareAudio,
      name: 'screen_share_audio',
      dtx: false,
      red: false,
    });
  };
  const startShareAudio = async (label: string): Promise<void> => {
    const device = (await navigator.mediaDevices.enumerateDevices()).find(
      (d) => d.kind === 'audioinput' && d.label === label
    );
    if (!device) {
      logger.warn(`Screen share audio device "${label}" not found`);
      return;
    }
    const track = await createLocalAudioTrack({
      deviceId: { exact: device.deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    });
    // The share may have ended while the device was opening.
    if (!sharingScreen$.value) {
      track.stop();
      return;
    }
    shareAudioTrack = track;
    await participant$.value?.publishTrack(track, {
      source: Track.Source.ScreenShareAudio,
      name: 'screen_share_audio',
      dtx: false,
      red: false,
    });
  };
  sharingScreen$.pipe(scope.bind()).subscribe((sharing) => {
    if (!sharing) stopShareAudio();
  });
  // The share's audio can be switched on or off while the share runs.
  callSettings.screenShareAudio$.pipe(scope.bind()).subscribe((source) => {
    if (!sharingScreen$.value) return;
    if (source.kind === 'pcm') {
      if (pcmShareAudio === null) startPcmShareAudio().catch(logger.error);
    } else if (source.kind !== 'device') stopShareAudio();
    else if (shareAudioTrack === null) startShareAudio(source.label).catch(logger.error);
  });

  let toggleScreenSharing: (() => void) | null = null;
  if ('getDisplayMedia' in (navigator.mediaDevices ?? {})) {
    const applyScreenShare = (): void => {
      const quality = callSettings.screenShareQuality$.value;
      const preset = screenShareBudget(quality);
      const hints = screenShareContentHints(callSettings.screenShareContent$.value);
      const audioSource = callSettings.screenShareAudio$.value;
      const screenshareSettings: ScreenShareCaptureOptions = {
        // Screen share audio shouldn't have any filtering.
        // "echoCancellation" is purposely excluded, as setting it to
        // false causes the screen share audio track to include
        // an echo of the incoming participant's voice
        audio:
          audioSource.kind === 'display'
            ? {
                autoGainControl: false,
                noiseSuppression: false,
                voiceIsolation: false,
                // Keeps the call itself out of a system audio capture. LiveKit passes
                // the object on to getDisplayMedia but does not know the constraint.
                ...({ suppressLocalAudioPlayback: true } as object),
              }
            : false,
        // Motion or text: whether the share keeps its frame rate or its sharpness under load.
        contentHint: hints.contentHint,
        // The 16:9 box until the share runs; then the Publisher fits it to the source.
        resolution: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
        systemAudio: audioSource.kind === 'display' ? 'include' : 'exclude',
      };
      const targetScreenshareState = !sharingScreen$.value;
      logger.info(`toggleScreenSharing called. Switching ${targetScreenshareState ? 'On' : 'Off'}`);
      // If a connection is ready, toggle screen sharing.
      // We deliberately do nothing in the case of a null connection because
      // it looks nice for the call control buttons to all become available
      // at once upon joining the call, rather than introducing a disabled
      // state. The user can just click again.
      // We also allow screen sharing to be toggled even if the connection
      // is still initializing or publishing tracks, because there's no
      // technical reason to disallow this. LiveKit will publish if it can.
      participant$.value
        ?.setScreenShareEnabled(targetScreenshareState, screenshareSettings, {
          screenShareEncoding: screenShareEncoding(quality),
          degradationPreference: hints.degradationPreference,
        })
        .then(() => {
          if (targetScreenshareState && audioSource.kind === 'pcm') return startPcmShareAudio();
          if (targetScreenshareState && audioSource.kind === 'device')
            return startShareAudio(audioSource.label);
          return undefined;
        })
        .catch(logger.error);
    };
    toggleScreenSharing = applyScreenShare;
  }
  const startScreenShare = (): void => {
    if (!sharingScreen$.value) toggleScreenSharing?.();
  };
  const stopScreenShare = (): void => {
    if (sharingScreen$.value) toggleScreenSharing?.();
  };
  const pushShareAudio = (chunk: Uint8Array): void => pcmShareAudio?.push(chunk);

  return {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    localMemberState$,
    publishError$,
    participant$,
    reconnecting$,
    connected$: matrixAndLivekitConnected$,
    disconnected$: scope.behavior(
      homeserverConnected.rtsSession$.pipe(map((state) => state === RTCSessionStatus.Disconnected))
    ),
    sharingScreen$,
    toggleScreenSharing,
    startScreenShare,
    stopScreenShare,
    pushShareAudio,
    connection$: localConnection$,
    internalLoggerRef: logger,
  };
};

export function observeSharingScreen$(p: Participant): Observable<boolean> {
  return observeParticipantEvents(
    p,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished
  ).pipe(map((participant) => participant.isScreenShareEnabled));
}

interface EnterRTCSessionOptions {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
  /** Ring or notify the room when the call starts; nothing when undefined. */
  notificationType: RTCNotificationType | undefined;
  callIntent: RTCCallIntent;
}

/**
 * Does the necessary steps to enter the RTC session on the matrix side:
 *  - Preparing the membership info (FOCUS to use, options)
 *  - Sends the matrix event to join the call, and starts the membership manager:
 *      - Delay events management
 *      - Handles retries (fails only after several attempts)
 *
 * @param rtcSession - The MatrixRTCSession to join.
 * @param ownMembershipIdentity - Options for entering the RTC session.
 * @param transport - The LivekitTransport to use for this session.
 * @param options - `encryptMedia`: Whether to encrypt media `matrixRTCMode`: The Matrix RTC mode to use.
 */
// Exported for unit testing
export function enterRTCSession(
  rtcSession: MatrixRTCSession,
  ownMembershipIdentity: CallMembershipIdentityParts,
  transport: LivekitTransport,
  options: EnterRTCSessionOptions
): void {
  const { encryptMedia, matrixRTCMode, notificationType, callIntent } = options;

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  // For backwards compatibility with Element Call versions that do not do Matrix 2.0,
  // we add the livekit alias to the transport.
  let backwardCompatibleTransport: LivekitTransport | LivekitTransport;
  if (matrixRTCMode === MatrixRTCMode.Matrix_2_0) {
    backwardCompatibleTransport = transport;
  } else {
    backwardCompatibleTransport = {
      livekit_alias: rtcSession.room.roomId,
      ...transport,
    };
  }

  // Calculates `maximumNetworkErrorRetryCount`. The connection is failed if EITHER:
  // - The /sync loop is unresponsive for > `gracePeriod` ms, or
  // - A delayed leave event is emitted (after `leaveDelay` ms period).
  // Note: Use leaveDelay >> gracePeriod for delegated leave events.
  const gracePeriod = SYNC_DISCONNECT_GRACE_PERIOD_MS;
  const leaveDelay = DELAYED_LEAVE_EVENT_DELAY_MS;
  const retryInterval = NETWORK_ERROR_RETRY_MS;

  // Math.min is used to account for the respective worst case: /sync not available or leave event emitted.
  const maxWaitTime = Math.min(gracePeriod, leaveDelay);
  const maximumNetworkErrorRetryCount = Math.ceil(maxWaitTime / retryInterval) + 1;

  // js-sdk 45 publishes a single transport list; the old preferred/active split is gone.
  // TODO where/how do we track errors originating from the ongoing rtcSession?

  rtcSession.join(ownMembershipIdentity, [backwardCompatibleTransport], {
    notificationType,
    callIntent,
    manageMediaKeys: encryptMedia,
    delayedLeaveEventDelayMs: DELAYED_LEAVE_EVENT_DELAY_MS,
    networkErrorRetryMs: NETWORK_ERROR_RETRY_MS,
    unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    maximumNetworkErrorRetryCount: maximumNetworkErrorRetryCount,
  });
}

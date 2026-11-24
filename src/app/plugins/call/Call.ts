import { type MatrixClient, type Room } from 'matrix-js-sdk';
import {
  type MatrixRTCSession,
  type RTCCallIntent,
  type RTCNotificationType,
} from 'matrix-js-sdk/lib/matrixrtc';
import { setLogLevel as setLivekitLogLevel } from 'livekit-client';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  interval,
  map,
  merge,
  type Observable,
  Subject,
} from 'rxjs';

import { cancelRing } from './cancelRing';
import { createRingback } from './ringback';
import { playCallEndSound } from '../../sound/play';
import { loopCallSound, playCallSound } from '../../sound/callSounds';
import { type EventSoundKind } from '../../sound/bundles';
import { type CallPreferences } from '../../state/callPreferences';
import { roomEncryptionSystem } from './engine/e2ee/encryptionSystem';
import { installBitrateHints } from './engine/livekit/bitrateHints';
import { type CallStatsConnection, sampleConnection } from './engine/livekit/callStats';
import { undecryptableParticipants$ } from './engine/livekit/decryptionHealth';
import {
  type EncryptionEvent,
  encryptionEvents$,
  retainEncryptionEvents,
} from './engine/livekit/encryptionLog';
import { ReactionsReader } from './engine/reactions/ReactionsReader';
import {
  type AutoLeaveReason,
  type CallNotificationWrapper,
  createSentCallNotification$,
} from './engine/state/CallViewModel/CallNotificationLifecycle';
import {
  type CallViewModel,
  createCallViewModel$,
} from './engine/state/CallViewModel/CallViewModel';
import { MatrixRTCMode } from './engine/state/CallViewModel/matrixRTCMode';
import { type Behavior, constant } from './engine/state/Behavior';
import { MediaDevices } from './engine/state/MediaDevices';
import { MuteStates } from './engine/state/MuteStates';
import { ObservableScope } from './engine/state/ObservableScope';
import { type ElementCallError } from './engine/utils/errors';

/** How a call ended: left by us or by itself, or stopped by an error it could not recover from. */
export type CallEnd =
  { reason: 'user' | AutoLeaveReason } | { reason: 'error'; error: ElementCallError };

/** One second of WebRTC counters across every SFU connection of the call. */
export type CallStatsSample = { time: number; connections: CallStatsConnection[] };

/** How much stats history a call keeps for the stats view. */
export const STATS_WINDOW_MS = 5 * 60 * 1000;

const STATS_INTERVAL_MS = 1000;

/** The most encryption events kept; a key rotation or a failing stream can make many. */
const ENCRYPTION_LOG_LIMIT = 500;

/** What Pinniped's call buttons show. The microphone shows as off while deafened. */
export type CallControlState = {
  microphone: boolean;
  video: boolean;
  /** Whether the call is audible; false is deafened. */
  sound: boolean;
  screenshare: boolean;
  spotlight: boolean;
};

/** A microphone or sound toggle the user made, remembered for the next call. */
export type CallUserToggle = Partial<Pick<CallPreferences, 'microphone' | 'sound'>>;

/** How long leaving may take to tell the homeserver before the call is gone anyway. */
const LEAVE_TIMEOUT_MS = 1000;

/** How we join: whether the room is a DM, and the microphone, camera and sound to start with. */
export type CallJoinOptions = {
  dm: boolean;
  preferences: CallPreferences;
};

let globalsInstalled = false;
/** Process-wide setup the call core expects, done once before the first call. */
const installGlobals = (): void => {
  if (globalsInstalled) return;
  globalsInstalled = true;
  installBitrateHints();
  setLivekitLogLevel('info');
};

/**
 * A call this client is in. It runs the call core on Pinniped's own Matrix client and lives until
 * the call is left, whether or not a call view shows it.
 */
export class Call {
  public readonly session: MatrixRTCSession;

  public readonly mediaDevices: MediaDevices;

  public readonly muteStates: MuteStates;

  public readonly vm: CallViewModel;

  /** Whether we started this call by ringing the other side of a DM. */
  public readonly ringing: boolean;

  /** Whether the ringback is audible, while we wait for the other side to pick up. */
  public readonly ringbackPlaying$: Behavior<boolean>;

  private readonly sentNotification$: Behavior<CallNotificationWrapper | null>;

  private readonly silenceRingback: () => void;

  /** WebRTC stats of the last {@link STATS_WINDOW_MS}, oldest first. */
  public readonly stats$ = new BehaviorSubject<CallStatsSample[]>([]);

  /** Key arrivals and decryption failures of the last {@link STATS_WINDOW_MS}, oldest first. */
  public readonly encryptionLog$ = new BehaviorSubject<EncryptionEvent[]>([]);

  /** Resolves with how the call ended, once it has; the call is disposed by then. */
  public readonly left: Promise<CallEnd>;

  public readonly controlState$: Behavior<CallControlState>;

  /** Remote participants, by LiveKit identity, whose media we cannot decrypt at the moment. */
  public readonly undecryptable$: Behavior<ReadonlySet<string>>;

  /** Microphone and sound toggles the user made (not ones the call made itself). */
  public readonly userToggles$ = new Subject<CallUserToggle>();

  private readonly scope = new ObservableScope();

  // The call picks its layout for the shape of the view showing it; the window's until one does.
  private readonly viewSize$ = new BehaviorSubject({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  private ended = false;

  public constructor(
    private readonly mx: MatrixClient,
    public readonly room: Room,
    { dm, preferences }: CallJoinOptions
  ) {
    installGlobals();
    this.session = mx.matrixRTC.getRoomSession(room);
    const starting = this.session.memberships.length === 0;
    this.ringing = dm && starting;
    const notificationType: RTCNotificationType = this.ringing ? 'ring' : 'notification';
    const callIntent: RTCCallIntent = preferences.video ? 'video' : 'audio';

    this.mediaDevices = new MediaDevices(this.scope);
    this.muteStates = new MuteStates(this.scope, this.mediaDevices, {
      audioEnabled: preferences.microphone,
      videoEnabled: preferences.video,
      deafened: !preferences.sound,
    });
    const reactions = new ReactionsReader(this.scope, this.session);
    this.vm = createCallViewModel$(
      this.scope,
      this.session,
      room,
      this.mediaDevices,
      this.muteStates,
      {
        encryptionSystem: roomEncryptionSystem(room),
        notificationType,
        callIntent,
        // A DM call ends when the other side leaves.
        autoLeaveWhenOthersLeft: dm,
        waitForCallPickup: this.ringing,
        matrixRTCMode$: constant(MatrixRTCMode.Compatibility),
        windowSize$: this.viewSize$,
      },
      reactions.raisedHands$,
      reactions.reactions$
    );

    // While the other side has not picked up, the ringback loops after its intro.
    const ringback = createRingback(this.scope, this.vm.ringing$, () =>
      loopCallSound('ringback', 'callStart')
    );
    this.sentNotification$ = createSentCallNotification$(this.scope, this.session);
    this.ringbackPlaying$ = ringback.playing$;
    this.silenceRingback = ringback.silence;
    this.playCallSounds();
    this.sampleStats();
    this.logEncryption();
    this.undecryptable$ = this.scope.behavior(
      undecryptableParticipants$(
        this.vm.livekitRoomItems$.pipe(map((items) => items.map((item) => item.livekitRoom))),
        this.stats$,
        STATS_INTERVAL_MS
      ),
      new Set()
    );

    this.controlState$ = this.scope.behavior(
      combineLatest(
        [
          this.muteStates.audio.enabled$,
          this.muteStates.video.enabled$,
          this.muteStates.deafened$,
          this.vm.sharingScreen$,
          this.vm.gridMode$,
        ],
        (microphone, video, deafened, screenshare, gridMode) => ({
          microphone,
          video,
          sound: !deafened,
          screenshare,
          spotlight: gridMode === 'spotlight',
        })
      )
    );

    const fatalError$: Observable<CallEnd> = this.vm.fatalError$.pipe(
      filter((error): error is ElementCallError => error !== null),
      map((error) => ({ reason: 'error', error }))
    );
    this.left = firstValueFrom(
      merge(this.vm.leave$.pipe(map((reason): CallEnd => ({ reason }))), fatalError$)
    );
    this.left.then(
      (end) => {
        if (end.reason !== 'error') playCallEndSound(end.reason);
        this.dispose();
      },
      () => undefined
    );

    this.vm.join();
  }

  /**
   * Stops ringing the other side and silences our ringback; the call keeps waiting for them to
   * join. Their ring stops where a client drops a redacted notification.
   */
  public stopRinging(): void {
    this.silenceRingback();
    cancelRing(this.mx, this.room.roomId, this.sentNotification$.value);
  }

  public get roomId(): string {
    return this.room.roomId;
  }

  /** Leaves the call; resolves once the homeserver has been told, or after a second. */
  public async hangup(): Promise<void> {
    // Leave the session first: ending the call's scope leaves it too, but without waiting.
    const leaving = this.session.leave(LEAVE_TIMEOUT_MS);
    this.vm.hangup();
    await leaving;
  }

  /** The size of the view showing the call, for its layout. */
  public setViewSize(width: number, height: number): void {
    const { value } = this.viewSize$;
    if (value.width !== width || value.height !== height) this.viewSize$.next({ width, height });
  }

  public toggleMicrophone(): void {
    const microphone = !this.muteStates.audio.enabled$.value;
    // The microphone shows as off while deafened, so unmuting while deafened also undeafens.
    if (microphone && this.muteStates.deafened$.value) this.muteStates.setDeafened(false);
    this.muteStates.audio.setEnabled$.value?.(microphone);
    this.userToggles$.next({ microphone });
  }

  public toggleVideo(): void {
    this.muteStates.video.toggle$.value?.();
  }

  public toggleSound(): void {
    const sound = this.muteStates.deafened$.value;
    this.muteStates.setDeafened(!sound);
    this.userToggles$.next({ sound });
  }

  public toggleSpotlight(): void {
    this.vm.setGridMode(this.vm.gridMode$.value === 'spotlight' ? 'grid' : 'spotlight');
  }

  /** Starts a screen share with the quality and audio in the call settings. */
  public startScreenShare(): void {
    this.vm.startScreenShare();
  }

  public stopScreenShare(): void {
    this.vm.stopScreenShare();
  }

  /** Stops the call without the leave sound, e.g. when the client logs out. Leaves the session. */
  public dispose(): void {
    this.ended = true;
    this.scope.end();
  }

  /** Call sounds, unless deafened: then the call is silent, its sounds included. */
  private playCallSounds(): void {
    const play = (kind: EventSoundKind) => (): void => {
      if (!this.muteStates.deafened$.value) playCallSound(kind);
    };
    this.vm.joinSoundEffect$.pipe(this.scope.bind()).subscribe(play('callJoin'));
    this.vm.leaveSoundEffect$.pipe(this.scope.bind()).subscribe(play('callLeave'));
    this.vm.newHandRaised$.pipe(this.scope.bind()).subscribe(play('raiseHand'));
    this.vm.newScreenShare$.pipe(this.scope.bind()).subscribe(play('screenshareStarted'));
  }

  /** Keeps the call's key arrivals and decryption failures, naming the participants by Matrix user. */
  private logEncryption(): void {
    const rooms$ = this.vm.livekitRoomItems$.pipe(
      map((items) => items.map((item) => item.livekitRoom))
    );
    encryptionEvents$(rooms$)
      .pipe(this.scope.bind())
      .subscribe((event) => {
        const participant = this.vm.livekitRoomItems$.value
          .map((item) => (event.identity === undefined ? undefined : item.userIds[event.identity]))
          .find((userId) => userId !== undefined);
        this.encryptionLog$.next(
          retainEncryptionEvents(
            [...this.encryptionLog$.value, { ...event, participant }],
            event.time - STATS_WINDOW_MS,
            ENCRYPTION_LOG_LIMIT
          )
        );
      });
  }

  /** Samples every SFU connection once a second, naming remote streams by Matrix user. */
  private sampleStats(): void {
    interval(STATS_INTERVAL_MS)
      .pipe(this.scope.bind())
      .subscribe(() => {
        // When the counters were asked for, not when they arrived.
        const time = Date.now();
        const items = this.vm.livekitRoomItems$.value;
        const samples = this.vm.allConnections$.value.getConnections().map(async (c) => {
          const url = c.transport.livekit_service_url;
          const userIds = items.find((item) => item.url === url)?.userIds ?? {};
          return sampleConnection(url, c.livekitRoom, userIds).catch(() => null);
        });
        void Promise.all(samples).then((sampled) => {
          const connections = sampled.filter((c): c is CallStatsConnection => c !== null);
          if (connections.length === 0 || this.ended) return;
          this.stats$.next([
            ...this.stats$.value.filter((s) => s.time > time - STATS_WINDOW_MS),
            { time, connections },
          ]);
        });
      });
  }
}

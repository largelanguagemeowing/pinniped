import { type MatrixClient, type Room } from 'matrix-js-sdk';
import {
  type MatrixRTCSession,
  type RTCCallIntent,
  type RTCNotificationType,
} from 'matrix-js-sdk/lib/matrixrtc';
import { setLogLevel as setLivekitLogLevel } from 'livekit-client';
import { BehaviorSubject, first, interval, type Observable } from 'rxjs';

import { playCallEndSound } from '../../sound/play';
import { loopCallSound, playCallSound } from '../../sound/callSounds';
import { type EventSoundKind } from '../../sound/bundles';
import { type CallPreferences } from '../../state/callPreferences';
import { roomEncryptionSystem } from './engine/e2ee/encryptionSystem';
import { installBitrateHints } from './engine/livekit/bitrateHints';
import { type CallStatsConnection, sampleConnection } from './engine/livekit/callStats';
import { ReactionsReader } from './engine/reactions/ReactionsReader';
import { type AutoLeaveReason } from './engine/state/CallViewModel/CallNotificationLifecycle';
import {
  type CallViewModel,
  createCallViewModel$,
} from './engine/state/CallViewModel/CallViewModel';
import { MatrixRTCMode } from './engine/state/CallViewModel/matrixRTCMode';
import { constant } from './engine/state/Behavior';
import { MediaDevices } from './engine/state/MediaDevices';
import { MuteStates } from './engine/state/MuteStates';
import { ObservableScope } from './engine/state/ObservableScope';

export type CallLeaveReason = 'user' | AutoLeaveReason;

/** One second of WebRTC counters across every SFU connection of the call. */
export type CallStatsSample = { time: number; connections: CallStatsConnection[] };

/** How much stats history a call keeps for the stats view. */
export const STATS_WINDOW_MS = 5 * 60 * 1000;

const STATS_INTERVAL_MS = 1000;

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

  /** WebRTC stats of the last {@link STATS_WINDOW_MS}, oldest first. */
  public readonly stats$ = new BehaviorSubject<CallStatsSample[]>([]);

  /** Emits once, why the call ended; the call is disposed by then. */
  public readonly left$: Observable<CallLeaveReason>;

  private readonly scope = new ObservableScope();

  private ended = false;

  public constructor(
    mx: MatrixClient,
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
      },
      reactions.raisedHands$,
      reactions.reactions$
    );

    this.playCallSounds();
    this.sampleStats();

    this.left$ = this.vm.leave$.pipe(first());
    this.left$.subscribe((reason) => {
      playCallEndSound(reason);
      this.dispose();
    });

    this.vm.join();
  }

  public get roomId(): string {
    return this.room.roomId;
  }

  /** Leaves the call; {@link left$} emits once it has. */
  public hangup(): void {
    this.vm.hangup();
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

    // While the other side has not picked up, the ringback loops after its intro.
    let stopRinging: (() => void) | undefined;
    this.vm.ringing$.pipe(this.scope.bind()).subscribe((ringing) => {
      stopRinging?.();
      stopRinging = ringing ? loopCallSound('ringback', 'callStart') : undefined;
    });
    this.scope.onEnd(() => stopRinging?.());
  }

  /** Samples every SFU connection once a second, naming remote streams by Matrix user. */
  private sampleStats(): void {
    interval(STATS_INTERVAL_MS)
      .pipe(this.scope.bind())
      .subscribe(() => {
        const items = this.vm.livekitRoomItems$.value;
        const samples = this.vm.allConnections$.value.getConnections().map(async (c) => {
          const url = c.transport.livekit_service_url;
          const userIds = items.find((item) => item.url === url)?.userIds ?? {};
          return sampleConnection(url, c.livekitRoom, userIds).catch(() => null);
        });
        void Promise.all(samples).then((sampled) => {
          const connections = sampled.filter((c): c is CallStatsConnection => c !== null);
          if (connections.length === 0 || this.ended) return;
          const time = Date.now();
          this.stats$.next([
            ...this.stats$.value.filter((s) => s.time > time - STATS_WINDOW_MS),
            { time, connections },
          ]);
        });
      });
  }
}

import { atom } from 'jotai';
import type { Call } from '../plugins/call/Call';
import type { ElementCallError } from '../plugins/call/engine/utils/errors';

const baseCallAtom = atom<Call | undefined>(undefined);

/** The error that stopped the last call, shown on that room's call view until the next call. */
export type CallFailure = { roomId: string; error: ElementCallError };

export const callFailureAtom = atom<CallFailure | undefined>(undefined);

/**
 * The call this client is in. Setting another call disposes the previous one, and a call that
 * ends (hung up here, or left by itself) removes itself once it has.
 */
export const callAtom = atom<Call | undefined, [Call | undefined], void>(
  (get) => get(baseCallAtom),
  (get, set, call) => {
    const previous = get(baseCallAtom);
    if (call === previous) return;

    previous?.dispose();
    set(baseCallAtom, call);
    if (call) set(callFailureAtom, undefined);

    call?.left.then(
      (end) => {
        if (get(baseCallAtom) !== call) return;
        set(baseCallAtom, undefined);
        if (end.reason === 'error') set(callFailureAtom, { roomId: call.roomId, error: end.error });
      },
      () => undefined
    );
  }
);

export const callChatAtom = atom<boolean>(false);

/** True while the user has been inactive in the call view, so the call UI can fade out. */
export const callIdleAtom = atom<boolean>(false);

/** True while the call view is fullscreened, so the app chrome (sidebars, top bar) can hide. */
export const callFullscreenAtom = atom<boolean>(false);

/** How the running call plays its audio, for the call report. */
export type CallPlayback = {
  state: AudioContextState;
  /** The output device's ID; '' is the system default. */
  sinkId: string;
  /** When the output failed, each time replacing the call's audio context (ms since epoch). */
  failures: number[];
};

/** The running call's playback; undefined while no call plays. */
export const callPlaybackAtom = atom<CallPlayback | undefined>(undefined);

/** Height in pixels of the screen share the call view shows, or null when it shows none. */
export const callStreamHeightAtom = atom<number | null>(null);

/**
 * How many call views (the call's video stage) are on screen. While one is, the call is in view
 * and the floating picture-in-picture does not show.
 */
export const callStageMountsAtom = atom<number>(0);

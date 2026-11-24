import { BehaviorSubject, combineLatest, type Observable } from 'rxjs';
import { type Behavior } from './engine/state/Behavior';
import { type ObservableScope } from './engine/state/ObservableScope';

export type Ringback = {
  /** Whether the ringback is audible: the other side is ringing and we did not silence it. */
  playing$: Behavior<boolean>;
  /** Silences the ringback; the other side keeps ringing, and the call keeps waiting. */
  silence: () => void;
};

/**
 * The caller's ringback: `start` runs while `playing$` holds and returns what stops it.
 * Silencing lasts for the rest of the call; a new ringing attempt does not undo it.
 */
export function createRingback(
  scope: ObservableScope,
  ringing$: Observable<boolean>,
  start: () => () => void
): Ringback {
  const silenced$ = new BehaviorSubject(false);
  const playing$ = scope.behavior(
    combineLatest([ringing$, silenced$], (ringing, silenced) => ringing && !silenced)
  );

  let stop: (() => void) | undefined;
  playing$.pipe(scope.bind()).subscribe((playing) => {
    stop?.();
    stop = playing ? start() : undefined;
  });
  scope.onEnd(() => stop?.());

  return { playing$, silence: () => silenced$.next(true) };
}

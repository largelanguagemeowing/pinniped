import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { ObservableScope } from '../../../../src/app/plugins/call/engine/state/ObservableScope';
import { createRingback } from '../../../../src/app/plugins/call/ringback';

const setup = (initial = false) => {
  const scope = new ObservableScope();
  const ringing$ = new BehaviorSubject(initial);
  const stop = vi.fn();
  const start = vi.fn(() => stop);
  const ringback = createRingback(scope, ringing$, start);
  return { scope, ringing$, start, stop, ringback };
};

describe('createRingback', () => {
  it('plays while the other side rings and stops when they pick up', () => {
    const { ringing$, start, stop } = setup();
    expect(start).not.toHaveBeenCalled();
    ringing$.next(true);
    expect(start).toHaveBeenCalledTimes(1);
    ringing$.next(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('silence stops the ringback and keeps it off for later ringing', () => {
    const { ringing$, start, stop, ringback } = setup(true);
    expect(ringback.playing$.value).toBe(true);
    ringback.silence();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(ringback.playing$.value).toBe(false);
    ringing$.next(false);
    ringing$.next(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('stops the ringback when the call ends', () => {
    const { scope, stop } = setup(true);
    scope.end();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ClientWidgetApi } from 'matrix-widget-api';
import { CallControl, CallControlEvent } from '../../src/app/plugins/call/CallControl';
import { CallControlState } from '../../src/app/plugins/call/CallControlState';
import { ElementWidgetActions } from '../../src/app/plugins/call/types';
import { initialCallViewState, parseCallViewState } from '../../src/app/plugins/call/view';

const makeControl = (state = new CallControlState(true, false, true)) => {
  const send = vi.fn().mockResolvedValue({});
  const control = new CallControl(state, { transport: { send } } as unknown as ClientWidgetApi);
  const requests = () =>
    send.mock.calls
      .filter(([action]) => action === ElementWidgetActions.CallControl)
      .map(([, data]) => data);
  return { control, send, requests };
};

describe('CallControl', () => {
  it('deafens and undeafens through the widget action', () => {
    const { control, requests } = makeControl();
    const toggles: unknown[] = [];
    control.on(CallControlEvent.UserToggle, (change) => toggles.push(change));

    control.toggleSound();
    expect(control.sound).toBe(false);
    control.toggleSound();
    expect(control.sound).toBe(true);

    expect(requests()).toEqual([{ outputEnabled: false }, { outputEnabled: true }]);
    expect(toggles).toEqual([{ sound: false }, { sound: true }]);
  });

  it('asks for the other layout, going by what the widget last reported', () => {
    const { control, requests } = makeControl();

    control.toggleSpotlight();
    control.onViewState({ layout: 'spotlight', screenSharing: false, streamHeight: null });
    expect(control.spotlight).toBe(true);
    control.toggleSpotlight();

    expect(requests()).toEqual([{ layout: 'spotlight' }, { layout: 'grid' }]);
  });

  it('shows the screen share the widget reports and can end it', () => {
    const { control, requests } = makeControl();
    const updates = vi.fn();
    control.on(CallControlEvent.StateUpdate, updates);

    control.onViewState({ layout: 'grid', screenSharing: true, streamHeight: 720 });
    expect(control.screenshare).toBe(true);
    expect(control.streamHeight).toBe(720);
    expect(updates).toHaveBeenCalledTimes(1);

    control.stopScreenshare();
    expect(requests()).toEqual([{ screenShare: false }]);
  });

  it('keeps the microphone, camera and deafen state when the view changes', () => {
    const { control } = makeControl(new CallControlState(false, true, false));
    control.onViewState({ layout: 'spotlight', screenSharing: true });
    expect(control.getState()).toEqual(new CallControlState(false, true, false, true, true));
  });

  it('does not fail when the widget does not answer', async () => {
    const { control, send } = makeControl();
    send.mockRejectedValue(new Error('Request timed out'));
    control.stopScreenshare();
    await Promise.resolve();
  });
});

describe('parseCallViewState', () => {
  it('reads what the widget reports', () => {
    expect(
      parseCallViewState(
        { layout: 'spotlight', screenSharing: true, streamHeight: 1080 },
        initialCallViewState
      )
    ).toEqual({ layout: 'spotlight', screenSharing: true, streamHeight: 1080 });
  });

  it('keeps the previous layout and share state for malformed fields, and drops a bad height', () => {
    const previous = { layout: 'spotlight', screenSharing: true, streamHeight: 720 } as const;
    expect(parseCallViewState(null, previous)).toBe(previous);
    expect(
      parseCallViewState({ layout: 'pip', screenSharing: 'yes', streamHeight: -1 }, previous)
    ).toEqual({ layout: 'spotlight', screenSharing: true, streamHeight: undefined });
    expect(parseCallViewState({ streamHeight: null }, previous).streamHeight).toBeUndefined();
  });
});

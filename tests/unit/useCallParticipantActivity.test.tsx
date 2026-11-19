import React from 'react';
import { act, create } from 'react-test-renderer';
import { BehaviorSubject } from 'rxjs';
import { expect, it } from 'vitest';
import type { Call } from '../../src/app/plugins/call/Call';
import type { ParticipantActivity } from '../../src/app/plugins/call/engine/state/CallViewModel/participantActivity';
import { useCallParticipantActivity } from '../../src/app/hooks/useCallParticipantActivity';

const activity = (
  speaking: string[],
  muted: string[] = [],
  sharing: string[] = []
): ParticipantActivity => ({
  speaking: new Set(speaking),
  muted: new Set(muted),
  deafened: new Set(),
  screenSharing: new Set(sharing),
});

/** A call whose view model reports activity through `activity$`. */
const fakeCall = () => {
  const activity$ = new BehaviorSubject(activity([]));
  return { call: { vm: { participantActivity$: activity$ } } as unknown as Call, activity$ };
};

let result!: ParticipantActivity;
function Harness({ call }: { call?: Call }) {
  result = useCallParticipantActivity(call);
  return null;
}

it('shows what the call reports, updating as people start and stop speaking, mute and share', () => {
  const { call, activity$ } = fakeCall();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Harness call={call} />);
  });
  expect(result.speaking.size).toBe(0);

  act(() => activity$.next(activity(['@alice:example.org', '@bob:example.org'])));
  expect([...result.speaking]).toEqual(['@alice:example.org', '@bob:example.org']);

  act(() => activity$.next(activity(['@alice:example.org'], ['@bob:example.org'])));
  expect([...result.speaking]).toEqual(['@alice:example.org']);
  expect([...result.muted]).toEqual(['@bob:example.org']);

  act(() => activity$.next(activity([], [], ['@bob:example.org', '@carol:example.org'])));
  expect([...result.screenSharing]).toEqual(['@bob:example.org', '@carol:example.org']);
  expect(result.speaking.size).toBe(0);

  act(() => renderer.unmount());
});

it('shows nothing without a call, and stops listening when the call goes away', () => {
  const { call, activity$ } = fakeCall();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Harness call={call} />);
  });
  act(() => activity$.next(activity(['@alice:example.org'])));
  expect(result.speaking.size).toBe(1);
  expect(activity$.observed).toBe(true);

  act(() => renderer.update(<Harness />));
  expect(result.speaking.size).toBe(0);
  expect(activity$.observed).toBe(false);
  act(() => renderer.unmount());
});

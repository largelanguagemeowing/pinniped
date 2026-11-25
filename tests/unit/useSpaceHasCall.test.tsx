import React from 'react';
import { EventEmitter } from 'events';
import { act, create } from 'react-test-renderer';
import { RoomStateEvent } from 'matrix-js-sdk';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpaceHasCall } from '../../src/app/hooks/useCall';

const state = vi.hoisted(() => ({
  children: [] as string[],
  inCall: new Set<string>(),
}));

const matrixRTC = Object.assign(new EventEmitter(), {
  getRoomSession: (room: { roomId: string }) => ({
    memberships: state.inCall.has(room.roomId) ? [{}] : [],
  }),
});
const mx = { matrixRTC, getRoom: (roomId: string) => ({ roomId }) };

vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => mx }));
vi.mock('../../src/app/utils/room', () => ({ getSpaceChildren: () => state.children }));

const mount = (space: EventEmitter) => {
  let hasCall = false;
  function Harness() {
    hasCall = useSpaceHasCall(space as never);
    return null;
  }
  act(() => {
    create(<Harness />);
  });
  return () => hasCall;
};

describe('useSpaceHasCall', () => {
  beforeEach(() => {
    state.children = [];
    state.inCall = new Set();
  });

  it('picks up a room with a running call that joins the space', () => {
    const space = new EventEmitter();
    const hasCall = mount(space);
    expect(hasCall()).toBe(false);

    state.inCall.add('!call:x');
    state.children = ['!call:x'];
    act(() => {
      space.emit(RoomStateEvent.Events);
    });

    expect(hasCall()).toBe(true);
  });

  it('follows the call sessions of the rooms it has', () => {
    state.children = ['!call:x'];
    const hasCall = mount(new EventEmitter());
    expect(hasCall()).toBe(false);

    state.inCall.add('!call:x');
    act(() => {
      matrixRTC.emit(MatrixRTCSessionManagerEvents.SessionStarted);
    });

    expect(hasCall()).toBe(true);
  });
});

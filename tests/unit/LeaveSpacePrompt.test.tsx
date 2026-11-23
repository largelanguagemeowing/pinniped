import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveSpacePrompt } from '../../src/app/components/leave-space-prompt/LeaveSpacePrompt';

const state = vi.hoisted(() => ({
  leaveRoomExplicitly: vi.fn(async (_mx: unknown, _roomId: string) => undefined),
}));

vi.mock('../../src/app/state/leftRooms', () => ({
  leaveRoomExplicitly: state.leaveRoomExplicitly,
}));
vi.mock('../../src/app/utils/room', () => ({ getSpaceChildren: () => ['!child:x'] }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getRoom: (id: string) => ({
      roomId: id,
      isSpaceRoom: () => false,
      getMyMembership: () => 'join',
    }),
  }),
}));
// Portals and focus traps need a browser; the dialog contents are what is under test.
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const mount = () => {
  const onDone = vi.fn();
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<LeaveSpacePrompt roomId="!space:x" onDone={onDone} onCancel={vi.fn()} />);
  });
  const checkbox = () =>
    r.root.findAll(
      (n) =>
        n.props.onClick &&
        n.props['aria-disabled'] === undefined &&
        n.type === 'div' &&
        n.props.style?.cursor === 'pointer'
    )[0];
  const leave = async () => {
    const button = r.root.findAllByType('button').find((b) => b.props.type === 'submit')!;
    await act(async () => {
      button.props.onClick();
    });
  };
  return { leave, onDone, checkbox, text: () => JSON.stringify(r.toJSON()) };
};

describe('LeaveSpacePrompt', () => {
  beforeEach(() => {
    state.leaveRoomExplicitly.mockReset();
    state.leaveRoomExplicitly.mockResolvedValue(undefined);
  });

  it('leaves only the space by default', async () => {
    const { leave, onDone } = mount();

    await leave();

    expect(state.leaveRoomExplicitly.mock.calls.map((c) => c[1])).toEqual(['!space:x']);
    expect(onDone).toHaveBeenCalled();
  });

  it('does not leave the space when one of its rooms could not be left', async () => {
    state.leaveRoomExplicitly.mockImplementation(async (_mx, roomId) => {
      if (roomId === '!child:x') throw new Error('boom');
    });
    const { leave, onDone, checkbox, text } = mount();
    act(() => checkbox().props.onClick());

    await leave();

    expect(state.leaveRoomExplicitly.mock.calls.map((c) => c[1])).toEqual(['!child:x']);
    expect(onDone).not.toHaveBeenCalled();
    expect(text()).toContain('boom');
  });
});

import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnOffRecoveryOverlay } from '../../src/app/components/TurnOffRecovery';

const state = vi.hoisted(() => ({
  disableKeyStorage: vi.fn(async () => {}),
  notify: vi.fn(),
  hasCrypto: true,
}));

// Portals and focus traps need a browser; the dialog contents are what is under test.
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getCrypto: () => (state.hasCrypto ? { disableKeyStorage: state.disableKeyStorage } : undefined),
  }),
}));
vi.mock('../../src/app/hooks/useKeyBackup', () => ({ notifyKeyBackupInfoChanged: state.notify }));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('TurnOffRecoveryOverlay', () => {
  let r: ReactTestRenderer;
  const onCancel = vi.fn();
  const mount = async () => {
    await act(async () => {
      r = create(<TurnOffRecoveryOverlay onCancel={onCancel} />);
    });
  };
  const button = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n) === label)[0];
  const all = () => textOf(r.root);

  beforeEach(() => {
    state.disableKeyStorage.mockReset();
    state.disableKeyStorage.mockImplementation(async () => {});
    state.notify.mockClear();
    state.hasCrypto = true;
    onCancel.mockClear();
  });
  afterEach(() => act(() => r.unmount()));

  it('says plainly what it deletes and what stays', async () => {
    await mount();
    expect(all()).toContain('Turn off recovery?');
    expect(all()).toContain('copy of your cross-signing keys that is stored on your homeserver');
    expect(all()).toContain('message key backup');
    expect(all()).toContain('Devices that are already verified stay verified');
    expect(all()).toContain('lose your identity and your message history');
  });

  it('deletes nothing until it is confirmed', async () => {
    await mount();
    await act(async () => {});
    expect(state.disableKeyStorage).not.toHaveBeenCalled();
  });

  it('turns recovery off once confirmed, tells the backup tile, and closes', async () => {
    await mount();
    await act(async () => button('Turn off recovery').props.onClick());
    expect(state.disableKeyStorage).toHaveBeenCalledTimes(1);
    expect(state.notify).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does nothing when cancelled', async () => {
    await mount();
    await act(async () => button('Cancel').props.onClick());
    expect(state.disableKeyStorage).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('stays open and shows the reason when turning it off fails', async () => {
    state.disableKeyStorage.mockImplementation(async () => {
      throw new Error('Homeserver refused');
    });
    await mount();
    await act(async () => button('Turn off recovery').props.onClick());
    expect(all()).toContain('Homeserver refused');
    expect(onCancel).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('disables both choices while it works', async () => {
    let finish: () => void = () => {};
    state.disableKeyStorage.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    await mount();
    await act(async () => {
      button('Turn off recovery').props.onClick();
    });
    expect(button('Turn off recovery').props.disabled).toBe(true);
    expect(button('Cancel').props.disabled).toBe(true);
    await act(async () => finish());
  });

  it('explains when encryption is not available, rather than doing nothing', async () => {
    state.hasCrypto = false;
    await mount();
    await act(async () => button('Turn off recovery').props.onClick());
    expect(all()).toContain('Encryption is not available on this device');
    expect(state.disableKeyStorage).not.toHaveBeenCalled();
  });
});

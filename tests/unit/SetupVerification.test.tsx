import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupVerification } from '../../src/app/components/DeviceVerificationSetup';

const state = vi.hoisted(() => ({
  existingBackup: undefined as { version: string } | null | undefined,
  resetKeyBackup: vi.fn(async () => {}),
  deleteKeyBackupVersion: vi.fn(async () => {}),
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getCrypto: () => ({
      createRecoveryKeyFromPassphrase: async () => ({
        encodedPrivateKey: 'EsTc 1abc',
        privateKey: new Uint8Array(32),
      }),
      bootstrapSecretStorage: async () => {},
      bootstrapCrossSigning: async () => {},
      resetKeyBackup: state.resetKeyBackup,
      getKeyBackupInfo: async () => state.existingBackup ?? null,
      deleteKeyBackupVersion: state.deleteKeyBackupVersion,
    }),
  }),
}));
vi.mock('../../src/app/components/ActionUIA', () => ({
  ActionUIA: () => null,
  ActionUIAFlowsLoader: () => null,
}));
vi.mock('../../src/app/components/password-input', () => ({ PasswordInput: () => null }));
vi.mock('../../src/app/styles/ContainerColor.css', () => ({ ContainerColor: () => 'c' }));
vi.mock('../../src/app/utils/dom', () => ({ copyToClipboard: vi.fn() }));
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('SetupVerification backup choice', () => {
  let r: ReactTestRenderer;
  const onComplete = vi.fn();
  const mount = async () => {
    await act(async () => {
      r = create(<SetupVerification onComplete={onComplete} />);
    });
  };
  const checkbox = () => r.root.findAll((n) => n.props.role === 'checkbox')[0];
  const submit = async () => {
    const form = r.root.findAll((n) => n.type === 'form')[0];
    await act(async () => {
      await form.props.onSubmit({
        preventDefault: () => {},
        target: { passphraseInput: { value: '' } },
      });
    });
  };

  beforeEach(() => {
    state.existingBackup = undefined;
    state.resetKeyBackup.mockClear();
    state.deleteKeyBackupVersion.mockClear();
    onComplete.mockClear();
  });
  afterEach(() => act(() => r.unmount()));

  it('backs up by default, and explains the trade-off', async () => {
    await mount();
    expect(checkbox().props['aria-checked']).toBe(true);
    const text = textOf(r.root);
    expect(text).toContain('Back up my message keys to my homeserver');
    expect(text).toContain('Its admin cannot read your messages from it, but could add keys to it');
    expect(text).toContain('forged messages could appear');
    expect(text).toContain('unless you export a key file');
  });

  it('creates a backup when left on', async () => {
    await mount();
    await submit();
    expect(state.resetKeyBackup).toHaveBeenCalledTimes(1);
    expect(state.deleteKeyBackupVersion).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('EsTc 1abc');
  });

  it('creates no backup when switched off', async () => {
    await mount();
    await act(async () => checkbox().props.onClick());
    expect(checkbox().props['aria-checked']).toBe(false);

    await submit();
    expect(state.resetKeyBackup).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('EsTc 1abc');
  });

  it('removes an old backup that the new key cannot open when switched off', async () => {
    state.existingBackup = { version: '3' };
    await mount();
    await act(async () => checkbox().props.onClick());
    await submit();
    expect(state.deleteKeyBackupVersion).toHaveBeenCalledWith('3');
    expect(state.resetKeyBackup).not.toHaveBeenCalled();
  });

  it('deletes nothing when switched off and there was no backup', async () => {
    await mount();
    await act(async () => checkbox().props.onClick());
    await submit();
    expect(state.deleteKeyBackupVersion).not.toHaveBeenCalled();
  });

  it('can be switched back on before submitting', async () => {
    await mount();
    await act(async () => checkbox().props.onClick());
    await act(async () => checkbox().props.onClick());
    await submit();
    expect(state.resetKeyBackup).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import {
  DeviceVerificationReset,
  SetupVerification,
} from '../../src/app/components/DeviceVerificationSetup';

const state = vi.hoisted(() => ({
  existingBackup: undefined as { version: string } | null | undefined,
  backupCheckFails: false,
  held: { masterKey: true, selfSigningKey: true, userSigningKey: true },
  bootstrapSecretStorage: vi.fn(async () => {}),
  bootstrapCrossSigning: vi.fn(async () => {}),
  resetKeyBackup: vi.fn(async () => {}),
  deleteKeyBackupVersion: vi.fn(async () => {}),
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    http: {
      authedRequest: async () => {
        if (state.backupCheckFails) throw new MatrixError({ errcode: 'M_UNKNOWN' }, 500);
        if (state.existingBackup) return state.existingBackup;
        throw new MatrixError({ errcode: 'M_NOT_FOUND' }, 404);
      },
    },
    getCrypto: () => ({
      createRecoveryKeyFromPassphrase: async () => ({
        encodedPrivateKey: 'EsTc 1abc',
        privateKey: new Uint8Array(32),
      }),
      bootstrapSecretStorage: state.bootstrapSecretStorage,
      bootstrapCrossSigning: state.bootstrapCrossSigning,
      getCrossSigningStatus: async () => ({ privateKeysCachedLocally: state.held }),
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
  const mount = async (props: { keepIdentity?: boolean } = {}) => {
    await act(async () => {
      r = create(<SetupVerification onComplete={onComplete} {...props} />);
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
    state.backupCheckFails = false;
    state.held = { masterKey: true, selfSigningKey: true, userSigningKey: true };
    state.bootstrapSecretStorage.mockClear();
    state.bootstrapCrossSigning.mockClear();
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

  it('keeps an old backup when the server could not be asked about it', async () => {
    state.existingBackup = { version: '3' };
    state.backupCheckFails = true;
    await mount();
    await act(async () => checkbox().props.onClick());
    await submit();
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

  describe('creating the identity, the normal first setup', () => {
    it('creates new identity keys and says Create recovery key', async () => {
      await mount();
      await submit();
      expect(state.bootstrapCrossSigning).toHaveBeenCalledWith(
        expect.objectContaining({ setupNewCrossSigning: true })
      );
      expect(textOf(r.root)).toContain('Create recovery key');
    });
  });

  describe('replacing an identity', () => {
    it('makes the new identity before it replaces secret storage', async () => {
      await mount();
      await submit();
      expect(state.bootstrapCrossSigning.mock.invocationCallOrder[0]).toBeLessThan(
        state.bootstrapSecretStorage.mock.invocationCallOrder[0]
      );
    });

    it('leaves secret storage alone when the identity step is refused', async () => {
      state.bootstrapCrossSigning.mockRejectedValueOnce(new Error('Authentication cancelled'));
      await mount();
      await submit();
      expect(state.bootstrapSecretStorage).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
      expect(textOf(r.root)).toContain('Authentication cancelled');
    });
  });

  describe('turning recovery back on around an identity that exists', () => {
    it('says what it will do and calls the button Turn on recovery', async () => {
      await mount({ keepIdentity: true });
      const text = textOf(r.root);
      expect(text).toContain('Recovery is off');
      expect(text).toContain('Your identity and verified devices stay as they are');
      expect(text).toContain('Turn on recovery');
      expect(text).not.toContain('Create recovery key');
    });

    it('stores the identity this device holds in a new recovery, and never creates a new identity', async () => {
      await mount({ keepIdentity: true });
      await submit();
      expect(state.bootstrapSecretStorage).toHaveBeenCalledWith(
        expect.objectContaining({ setupNewSecretStorage: true })
      );
      expect(state.bootstrapCrossSigning).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith('EsTc 1abc');
    });

    it.each([
      ['master', { masterKey: false, selfSigningKey: true, userSigningKey: true }],
      ['self-signing', { masterKey: true, selfSigningKey: false, userSigningKey: true }],
      ['user-signing', { masterKey: true, selfSigningKey: true, userSigningKey: false }],
    ])('refuses, changing nothing, when this device lacks the %s key', async (_name, held) => {
      state.held = held;
      await mount({ keepIdentity: true });
      await submit();
      expect(state.bootstrapSecretStorage).not.toHaveBeenCalled();
      expect(state.bootstrapCrossSigning).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
      expect(textOf(r.root)).toContain('does not hold your identity keys');
    });

    it('still lets the person choose whether to back up', async () => {
      await mount({ keepIdentity: true });
      await act(async () => checkbox().props.onClick());
      await submit();
      expect(state.resetKeyBackup).not.toHaveBeenCalled();
      expect(state.bootstrapCrossSigning).not.toHaveBeenCalled();
    });
  });
});

describe('DeviceVerificationReset close button', () => {
  let r: ReactTestRenderer;
  const onCancel = vi.fn();
  const closeButton = () =>
    r.root.findAll((n) => n.props['aria-label'] === 'Close' && n.type === 'button');
  const startReset = async () => {
    await act(async () => {
      r = create(<DeviceVerificationReset onCancel={onCancel} />);
    });
    const reset = r.root.findAll(
      (n) => n.type === 'button' && textOf(n).includes('Reset encryption identity')
    );
    await act(async () => reset[0].props.onClick());
  };
  afterEach(() => act(() => r.unmount()));

  it('stays available after the reset form opens, so a failed attempt is not a dead end', async () => {
    await startReset();

    expect(textOf(r.root)).toContain('Create recovery key');
    expect(closeButton()).toHaveLength(1);
  });

  it('is held while setup runs', async () => {
    let finish!: () => void;
    state.bootstrapCrossSigning.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await startReset();

    const form = r.root.findAll((n) => n.type === 'form')[0];
    await act(async () => {
      form.props.onSubmit({ preventDefault: () => {}, target: { passphraseInput: { value: '' } } });
    });
    expect(closeButton()).toHaveLength(0);

    await act(async () => finish());
    // the recovery key is on screen now; closing is through its own Done
    expect(closeButton()).toHaveLength(0);
  });
});

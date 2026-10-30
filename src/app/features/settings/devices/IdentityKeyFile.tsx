import React, { FormEventHandler, useCallback, useRef, useState } from 'react';
import { Box, Button, Spinner, Text, color } from 'folds';
import FileSaver from 'file-saver';
import { SettingTile } from '../../../components/setting-tile';
import { PasswordInput } from '../../../components/password-input';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { keyFilename } from '../../../utils/recoveryKeyFile';
import { exportIdentityKeyFile, importIdentityKeyFile } from '../../../utils/identityKeyFile';

function Status({ error, done }: { error?: Error; done?: string }) {
  if (error) {
    return (
      <Text size="T200" style={{ color: color.Critical.Main }}>
        <b>{error.message}</b>
      </Text>
    );
  }
  return done ? (
    <Text size="T200" style={{ color: color.Success.Main }}>
      <b>{done}</b>
    </Text>
  ) : null;
}

export function ExportIdentityKeysTile() {
  const mx = useMatrixClient();
  const [open, setOpen] = useState(false);
  const [state, run] = useAsyncCallback<void, Error, [string]>(
    useCallback(
      async (password) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('Encryption is not available on this device.');
        const file = await exportIdentityKeyFile(crypto, password);
        FileSaver.saveAs(
          new Blob([file], { type: 'text/plain;charset=us-ascii' }),
          keyFilename('identity-keys', mx.getSafeUserId())
        );
      },
      [mx]
    )
  );
  const busy = state.status === AsyncStatus.Loading;

  const submit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement & {
      passwordInput: HTMLInputElement;
      confirmInput: HTMLInputElement;
    };
    const password = form.passwordInput.value;
    if (!password || password !== form.confirmInput.value) return;
    run(password)
      .then(() => setOpen(false))
      .catch(() => undefined);
  };

  return (
    <>
      <SettingTile
        title="Export identity keys"
        description="Save your cross-signing keys, which prove you are you, in a password-protected file. Anyone with the file and its password can act as you, so keep it somewhere safe. Use a long password."
        after={
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            onClick={() => setOpen(!open)}
          >
            <Text as="span" size="B300">
              {open ? 'Collapse' : 'Expand'}
            </Text>
          </Button>
        }
      />
      {open && (
        <Box as="form" onSubmit={submit} direction="Column" gap="200">
          <Text size="L400">New password</Text>
          <PasswordInput name="passwordInput" size="400" required readOnly={busy} />
          <Text size="L400">Confirm password</Text>
          <PasswordInput name="confirmInput" size="400" required readOnly={busy} />
          <Box>
            <Button
              type="submit"
              size="400"
              variant="Critical"
              disabled={busy}
              before={busy && <Spinner size="200" variant="Critical" fill="Solid" />}
            >
              <Text as="span" size="B400">
                Export
              </Text>
            </Button>
          </Box>
          <Status error={state.status === AsyncStatus.Error ? state.error : undefined} />
        </Box>
      )}
    </>
  );
}

export function ImportIdentityKeysTile() {
  const mx = useMatrixClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [state, run] = useAsyncCallback<void, Error, [File, string]>(
    useCallback(
      async (picked, password) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('Encryption is not available on this device.');
        await importIdentityKeyFile(crypto, await picked.arrayBuffer(), password);
      },
      [mx]
    )
  );
  const busy = state.status === AsyncStatus.Loading;

  const submit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { passwordInput } = evt.target as HTMLFormElement & { passwordInput: HTMLInputElement };
    if (!file || !passwordInput.value) return;
    run(file, passwordInput.value)
      .then(() => setFile(undefined))
      .catch(() => undefined);
  };

  return (
    <>
      <SettingTile
        title="Import identity keys"
        description="Load an identity key file you exported yourself. This verifies this device. Only use a file you made: whoever made it controls your identity."
        after={
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            onClick={() => fileInput.current?.click()}
          >
            <Text as="span" size="B300">
              {file ? file.name : 'Choose file'}
            </Text>
          </Button>
        }
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(evt) => setFile(evt.target.files?.[0])}
      />
      {file && (
        <Box as="form" onSubmit={submit} direction="Column" gap="200">
          <Text size="L400">Password</Text>
          <PasswordInput name="passwordInput" size="400" required readOnly={busy} />
          <Box>
            <Button
              type="submit"
              size="400"
              disabled={busy}
              before={busy && <Spinner size="200" variant="Primary" fill="Solid" />}
            >
              <Text as="span" size="B400">
                Import
              </Text>
            </Button>
          </Box>
        </Box>
      )}
      <Status
        error={state.status === AsyncStatus.Error ? state.error : undefined}
        done={
          state.status === AsyncStatus.Success
            ? 'Identity keys imported. This device is verified.'
            : undefined
        }
      />
    </>
  );
}

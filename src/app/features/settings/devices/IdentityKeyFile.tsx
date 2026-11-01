import React, { useCallback, useRef } from 'react';
import { Button, Spinner, Text, color } from 'folds';
import FileSaver from 'file-saver';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { identityKeysFilename } from '../../../utils/recoveryKeyFile';
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
  const [state, run] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      const crypto = mx.getCrypto();
      if (!crypto) throw new Error('Encryption is not available on this device.');
      const file = await exportIdentityKeyFile(crypto);
      FileSaver.saveAs(
        new Blob([file], { type: 'application/json' }),
        identityKeysFilename(mx.getSafeUserId())
      );
    }, [mx])
  );
  const busy = state.status === AsyncStatus.Loading;

  return (
    <>
      <SettingTile
        title="Export identity keys"
        description="Save your cross-signing keys, which prove you are you, as a plain JSON file. It is not encrypted: anyone who gets the file can act as you, so keep it somewhere safe and delete it when you are done."
        after={
          <Button
            size="300"
            variant="Critical"
            fill="Soft"
            outlined
            radii="300"
            disabled={busy}
            before={busy && <Spinner size="100" variant="Critical" fill="Soft" />}
            onClick={() => {
              run().catch(() => undefined);
            }}
          >
            <Text as="span" size="B300">
              Export
            </Text>
          </Button>
        }
      />
      <Status error={state.status === AsyncStatus.Error ? state.error : undefined} />
    </>
  );
}

export function ImportIdentityKeysTile() {
  const mx = useMatrixClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, run] = useAsyncCallback<void, Error, [File]>(
    useCallback(
      async (picked) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('Encryption is not available on this device.');
        const deviceId = mx.getDeviceId();
        if (!deviceId) throw new Error('This session has no device ID.');
        await importIdentityKeyFile(crypto, deviceId, await picked.text());
      },
      [mx]
    )
  );
  const busy = state.status === AsyncStatus.Loading;

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
            disabled={busy}
            before={busy && <Spinner size="100" variant="Secondary" fill="Soft" />}
            onClick={() => fileInput.current?.click()}
          >
            <Text as="span" size="B300">
              Choose file
            </Text>
          </Button>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(evt) => {
          const picked = evt.target.files?.[0];
          // Reset so choosing the same file again after a failure runs again.
          evt.target.value = '';
          if (picked) run(picked).catch(() => undefined);
        }}
      />
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

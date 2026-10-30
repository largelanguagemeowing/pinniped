import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Spinner, Text, color } from 'folds';
import { VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';
import { AuthShell } from '../../pages/auth/AuthShell';
import { AuthAside, AsideCopy } from '../../pages/auth/AuthAside';
import * as css from '../../pages/auth/styles.css';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { VerificationStatus } from '../../hooks/useDeviceVerificationStatus';
import {
  useSecretStorageDefaultKeyId,
  useSecretStorageKeyContent,
} from '../../hooks/useSecretStorage';
import { useVerifyWithRecoveryKey } from '../../hooks/useVerifyWithRecoveryKey';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import {
  cancelVerificationRequest,
  DeviceVerificationFlow,
} from '../../components/DeviceVerification';
import {
  DeviceVerificationResetOverlay,
  RecoveryKeyDisplay,
  SetupVerification,
} from '../../components/DeviceVerificationSetup';
import {
  ManualVerificationMethod,
  ManualVerificationMethodSwitcher,
} from '../../components/ManualVerification';
import {
  SecretStorageRecoveryKey,
  SecretStorageRecoveryPassphrase,
} from '../../components/SecretStorage';
import { SecretStorageKeyContent } from '../../../types/matrix/accountData';
import {
  dismissGate,
  GateKind,
  gateKind,
  justVerified,
  shouldShowGate,
} from './deviceVerificationGate';
import { useVerificationGateState } from './useVerificationGateState';

type View = 'choose' | 'device' | 'key' | 'skip';

const ASIDE: Record<View | 'done' | 'setup' | 'skipSetup', AsideCopy> = {
  choose: {
    heading: 'Why this step matters',
    paragraphs: [
      'Your password got you in, but it does not open your encrypted messages. Verifying proves this device is yours and fetches the keys to read your history.',
      'Someone with only your password can sign in, but they cannot verify. Your contacts see their device as unverified.',
    ],
  },
  device: {
    heading: 'Compare the emoji carefully',
    paragraphs: [
      'Both screens must show the same emoji in the same order. That check confirms nothing sits between your two devices.',
      'If they differ, cancel. Someone may be trying to intercept the verification.',
    ],
  },
  key: {
    heading: 'What the recovery key is',
    paragraphs: [
      'A secret only you hold. Your homeserver stores a locked copy of your keys, not the key that opens it, so nobody else can read your history.',
      'A passphrase is the same key in a form you can remember. It is not your login password.',
    ],
  },
  skip: {
    heading: 'You can verify any time',
    paragraphs: [
      'A banner stays in the app until this device is verified. Verifying later takes the same steps.',
    ],
  },
  setup: {
    heading: 'Why set up recovery',
    paragraphs: [
      'Your messages are end-to-end encrypted, so the keys that read them live on your devices. Without a recovery key, signing out or losing this device locks them for good.',
      'Your homeserver cannot read your messages and cannot restore them for you. The key is yours alone.',
    ],
  },
  skipSetup: {
    heading: 'You can set this up later',
    paragraphs: [
      'A banner stays in the app until recovery is set up. You can also do it from Settings at any time.',
    ],
  },
  done: {
    heading: 'What changed',
    paragraphs: [
      'Your contacts and your other devices now see this device as verified, and you will not be asked again on this device.',
    ],
  },
};

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Box direction="Column" gap="200">
      <Text size="H2" priority="400">
        {title}
      </Text>
      {children && (
        <Text size="T400" priority="300">
          {children}
        </Text>
      )}
    </Box>
  );
}

function ActionWithHint({
  label,
  hint,
  variant,
  onClick,
}: {
  label: string;
  hint: string;
  variant: 'Primary' | 'Secondary';
  onClick: () => void;
}) {
  return (
    <Box direction="Column" gap="100">
      <Button
        variant={variant}
        fill={variant === 'Primary' ? 'Solid' : 'Soft'}
        size="500"
        onClick={onClick}
      >
        <Text as="span" size="B500">
          {label}
        </Text>
      </Button>
      <Text size="T200" priority="300">
        {hint}
      </Text>
    </Box>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="Secondary" fill="None" size="400" onClick={onClick}>
      <Text as="span" size="B400">
        Back
      </Text>
    </Button>
  );
}

function ChooseView({
  canUseKey,
  onDevice,
  onKey,
  onSkip,
}: {
  canUseKey: boolean;
  onDevice: () => void;
  onKey: () => void;
  onSkip: () => void;
}) {
  return (
    <Box direction="Column" gap="500">
      <Heading title="Verify this device">
        You are signed in, but this device is not trusted yet. Verify it to read your encrypted
        messages and show other people it is really you.
      </Heading>
      <Box direction="Column" gap="400">
        <ActionWithHint
          label="Verify with another device"
          hint="Fastest. Approve on a device that is already signed in."
          variant="Primary"
          onClick={onDevice}
        />
        {canUseKey && (
          <ActionWithHint
            label="Use recovery key or passphrase"
            hint="No other device? Use the key or passphrase you saved."
            variant="Secondary"
            onClick={onKey}
          />
        )}
      </Box>
      <Box>
        <Button variant="Secondary" fill="None" size="400" onClick={onSkip}>
          <Text as="span" size="B400">
            Continue without verifying
          </Text>
        </Button>
      </Box>
    </Box>
  );
}

function DeviceView({
  canUseKey,
  onBack,
  onKey,
}: {
  canUseKey: boolean;
  onBack: () => void;
  onKey: () => void;
}) {
  const mx = useMatrixClient();
  const [requestState, requestVerification] = useAsyncCallback<VerificationRequest, Error, []>(
    useCallback(async () => {
      const crypto = mx.getCrypto();
      if (!crypto) throw new Error('Encryption is not available on this device.');
      return crypto.requestOwnUserVerification();
    }, [mx])
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    requestVerification();
  }, [requestVerification]);

  const request = requestState.status === AsyncStatus.Success ? requestState.data : undefined;

  const handleBack = () => {
    if (request) cancelVerificationRequest(request);
    onBack();
  };

  return (
    <Box direction="Column" gap="500">
      <Heading title="Verify with another device">
        Open Pinniped or another Matrix app on a device that is already signed in, then accept the
        request.
      </Heading>
      {requestState.status === AsyncStatus.Loading && (
        <Box alignItems="Center" gap="200">
          <Spinner size="100" variant="Secondary" />
          <Text size="T300">Contacting your other devices...</Text>
        </Box>
      )}
      {requestState.status === AsyncStatus.Error && (
        <Box direction="Column" gap="200">
          <Text size="T300" style={{ color: color.Critical.Main }}>
            Could not start verification: {requestState.error.message}
          </Text>
          <Box>
            <Button variant="Secondary" fill="Soft" size="400" onClick={requestVerification}>
              <Text as="span" size="B400">
                Try again
              </Text>
            </Button>
          </Box>
        </Box>
      )}
      {request && <DeviceVerificationFlow request={request} onExit={onBack} />}
      <Box gap="200" wrap="Wrap">
        <BackButton onClick={handleBack} />
        {canUseKey && (
          <Button
            variant="Secondary"
            fill="None"
            size="400"
            onClick={() => {
              if (request) cancelVerificationRequest(request);
              onKey();
            }}
          >
            <Text as="span" size="B400">
              No other device? Use recovery key
            </Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

function KeyView({
  keyId,
  keyContent,
  onBack,
}: {
  keyId: string;
  keyContent: SecretStorageKeyContent;
  onBack: () => void;
}) {
  const hasPassphrase = !!keyContent.passphrase;
  const [method, setMethod] = useState(
    hasPassphrase
      ? ManualVerificationMethod.RecoveryPassphrase
      : ManualVerificationMethod.RecoveryKey
  );
  const { verifyState, verify, verifying } = useVerifyWithRecoveryKey(keyId);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <Box direction="Column" gap="500">
      <Heading title="Enter your recovery key">
        This unlocks your encrypted backup and verifies this device.
      </Heading>
      {hasPassphrase && (
        <Box>
          <ManualVerificationMethodSwitcher value={method} onChange={setMethod} />
        </Box>
      )}
      {method === ManualVerificationMethod.RecoveryKey && (
        <SecretStorageRecoveryKey
          processing={verifying}
          keyContent={keyContent}
          onDecodedRecoveryKey={verify}
        />
      )}
      {method === ManualVerificationMethod.RecoveryPassphrase && keyContent.passphrase && (
        <SecretStorageRecoveryPassphrase
          processing={verifying}
          keyContent={keyContent}
          passphraseContent={keyContent.passphrase}
          onDecodedRecoveryKey={verify}
        />
      )}
      {verifyState.status === AsyncStatus.Error && (
        <Text size="T300" style={{ color: color.Critical.Main }}>
          <b>{verifyState.error.message}</b>
        </Text>
      )}
      <Box gap="200" wrap="Wrap">
        <BackButton onClick={onBack} />
        <Button variant="Secondary" fill="None" size="400" onClick={() => setResetOpen(true)}>
          <Text as="span" size="B400">
            Lost your recovery key?
          </Text>
        </Button>
      </Box>
      {resetOpen && <DeviceVerificationResetOverlay onCancel={() => setResetOpen(false)} />}
    </Box>
  );
}

function SkipView({
  kind,
  onBack,
  onContinue,
}: {
  kind: GateKind;
  onBack: () => void;
  onContinue: () => void;
}) {
  const setup = kind === 'setup';
  return (
    <Box direction="Column" gap="500">
      <Heading title={setup ? 'Continue without recovery?' : 'Continue without verifying?'}>
        {setup
          ? 'You can still use Pinniped, but without a recovery key:'
          : 'You can still use Pinniped, but until you verify:'}
      </Heading>
      <Text as="div" size="T300">
        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
          {setup ? (
            <>
              <li>
                If you sign out or lose this device, your encrypted messages cannot be restored.
              </li>
              <li>People you chat with see this device as unverified.</li>
            </>
          ) : (
            <>
              <li>Older encrypted messages stay unreadable on this device.</li>
              <li>People you chat with see this device as unverified.</li>
              <li>You cannot tell this device apart from one an intruder added.</li>
            </>
          )}
        </ul>
      </Text>
      <Box direction="Column" gap="200">
        <Button variant="Primary" size="500" onClick={onBack}>
          <Text as="span" size="B500">
            {setup ? 'Go back and set up' : 'Go back and verify'}
          </Text>
        </Button>
        <Button variant="Secondary" fill="Soft" size="500" onClick={onContinue}>
          <Text as="span" size="B500">
            {setup ? 'Continue without recovery' : 'Continue unverified'}
          </Text>
        </Button>
      </Box>
    </Box>
  );
}

function SetupView({
  recoveryKey,
  onCreated,
  onSaved,
  onSkip,
}: {
  recoveryKey: string | undefined;
  onCreated: (recoveryKey: string) => void;
  onSaved: () => void;
  onSkip: () => void;
}) {
  if (recoveryKey) {
    return (
      <Box direction="Column" gap="500">
        <Heading title="Save your recovery key" />
        <RecoveryKeyDisplay recoveryKey={recoveryKey} onDone={onSaved} />
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="500">
      <Heading title="Secure your messages" />
      <SetupVerification onComplete={onCreated} />
      <Box>
        <Button variant="Secondary" fill="None" size="400" onClick={onSkip}>
          <Text as="span" size="B400">
            Continue without recovery
          </Text>
        </Button>
      </Box>
    </Box>
  );
}

function DoneView({ onContinue }: { onContinue: () => void }) {
  return (
    <Box direction="Column" gap="500">
      <Heading title="This device is verified">
        If you have a key backup, older messages are restored in the background and appear as their
        keys arrive.
      </Heading>
      <Button variant="Primary" size="500" onClick={onContinue}>
        <Text as="span" size="B500">
          Continue to Pinniped
        </Text>
      </Button>
    </Box>
  );
}

/**
 * Asks a signed-in but unverified device to verify before the app opens, or, when the account
 * has no encryption identity yet, to set up recovery. Either can be skipped, and the choice is
 * remembered per device so it does not return on every launch.
 */
export function DeviceVerificationGate() {
  const { userId, deviceId, identity, status, dismissed } = useVerificationGateState();

  const keyId = useSecretStorageDefaultKeyId();
  const keyContent = useSecretStorageKeyContent(keyId ?? '');
  const canUseKey = !!keyId && !!keyContent;

  const [finished, setFinished] = useState(false);
  const [view, setView] = useState<View>('choose');
  // Creating the keys makes the account look verified, or briefly half-verified, long before the
  // person has saved the key. Once setup was asked it stays in charge until the key is saved or
  // skipped, so the screen cannot flip to verification part-way through.
  const [setupActive, setSetupActive] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string>();
  const wasVerifying = useRef(false);

  const asked = gateKind({ identity, status, dismissed });

  useEffect(() => {
    // One line per change, so a missing prompt can be diagnosed from the console.
    console.info('[verify-gate]', {
      identity,
      status: VerificationStatus[status],
      asked,
      dismissed,
    });
  }, [identity, status, asked, dismissed.verify, dismissed.setup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (asked === 'setup') setSetupActive(true);
  }, [asked]);

  const settingUp = setupActive || recoveryKey !== undefined;

  useEffect(() => {
    if (settingUp) return;
    if (asked === 'verify') {
      wasVerifying.current = true;
    } else if (justVerified(wasVerifying.current, { identity, status, dismissed })) {
      wasVerifying.current = false;
      setFinished(true);
    }
  }, [settingUp, asked, identity, status, dismissed]);

  const kind: GateKind = settingUp ? 'setup' : (asked ?? 'verify');

  if (!settingUp && !shouldShowGate({ identity, status, dismissed, finished })) return null;

  const handleSkip = () => {
    setView('choose');
    setSetupActive(false);
    if (deviceId) dismissGate(kind, userId, deviceId);
  };

  const handleKeySaved = () => {
    setRecoveryKey(undefined);
    setSetupActive(false);
  };

  let content: React.ReactNode;
  let aside: AsideCopy;
  if (kind === 'setup') {
    const skipping = view === 'skip' && recoveryKey === undefined;
    content = skipping ? (
      <SkipView kind="setup" onBack={() => setView('choose')} onContinue={handleSkip} />
    ) : (
      <SetupView
        recoveryKey={recoveryKey}
        onCreated={setRecoveryKey}
        onSaved={handleKeySaved}
        onSkip={() => setView('skip')}
      />
    );
    aside = ASIDE[skipping ? 'skipSetup' : 'setup'];
  } else if (finished) {
    content = <DoneView onContinue={() => setFinished(false)} />;
    aside = ASIDE.done;
  } else {
    if (view === 'device') {
      content = (
        <DeviceView
          canUseKey={canUseKey}
          onBack={() => setView('choose')}
          onKey={() => setView('key')}
        />
      );
    } else if (view === 'key' && keyId && keyContent) {
      content = <KeyView keyId={keyId} keyContent={keyContent} onBack={() => setView('choose')} />;
    } else if (view === 'skip') {
      content = <SkipView kind="verify" onBack={() => setView('choose')} onContinue={handleSkip} />;
    } else {
      content = (
        <ChooseView
          canUseKey={canUseKey}
          onDevice={() => setView('device')}
          onKey={() => setView('key')}
          onSkip={() => setView('skip')}
        />
      );
    }
    aside = ASIDE[view === 'key' && !(keyId && keyContent) ? 'choose' : view];
  }

  return (
    <Box className={css.AuthGate} direction="Column">
      <AuthShell aside={<AuthAside {...aside} />}>{content}</AuthShell>
    </Box>
  );
}

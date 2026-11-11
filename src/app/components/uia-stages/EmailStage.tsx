import React, { useEffect, useCallback, useMemo, FormEventHandler, useState } from 'react';
import { Dialog, Text, Box, Button, config, Input, color, Spinner } from 'folds';
import { AuthDict, AuthType, MatrixError } from 'matrix-js-sdk';
import { StageComponentProps } from './types';
import { AsyncState, AsyncStatus } from '../../hooks/useAsyncCallback';
import { RequestEmailTokenCallback, RequestEmailTokenResponse } from '../../hooks/types';
import {
  describeEmailTokenError,
  suggestEmailFix,
} from '../../pages/auth/register/registerHelpers';

const POLL_INTERVAL_MS = 4000;

function EmailErrorDialog({
  title,
  message,
  defaultEmail,
  onRetry,
  onCancel,
}: {
  title: string;
  message: string;
  defaultEmail?: string;
  onRetry: (email: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultEmail ?? '');
  const suggestion = suggestEmailFix(value.trim());

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const email = value.trim();
    if (email) onRetry(email);
  };

  return (
    <Dialog>
      <Box
        as="form"
        onSubmit={handleFormSubmit}
        style={{ padding: config.space.S400 }}
        direction="Column"
        gap="400"
      >
        <Box direction="Column" gap="100">
          <Text size="H4">{title}</Text>
          <Text>{message}</Text>
          <Text as="label" size="L400" style={{ paddingTop: config.space.S400 }}>
            Email
          </Text>
          <Input
            name="retryEmailInput"
            variant="Background"
            size="500"
            type="email"
            autoComplete="email"
            outlined
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            required
            autoFocus
          />
          {suggestion && (
            <Text size="T300">
              Did you mean{' '}
              <Button
                type="button"
                size="300"
                variant="Primary"
                fill="None"
                onClick={() => setValue(suggestion)}
              >
                <Text as="span" size="B300">
                  {suggestion}
                </Text>
              </Button>
              ?
            </Text>
          )}
        </Box>
        <Button variant="Primary" type="submit">
          <Text as="span" size="B400">
            Send verification email
          </Text>
        </Button>
        <Button variant="Secondary" fill="None" outlined type="button" onClick={onCancel}>
          <Text as="span" size="B400">
            Back to the form
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}

export function EmailStageDialog({
  email,
  clientSecret,
  stageData,
  emailTokenState,
  requestEmailToken,
  submitAuthDict,
  pollAuthDict,
  onCancel,
}: StageComponentProps & {
  email?: string;
  clientSecret: string;
  emailTokenState: AsyncState<RequestEmailTokenResponse, MatrixError>;
  requestEmailToken: RequestEmailTokenCallback;
  /** Submits the stage without UI side effects; the parent advances once the link was clicked. */
  pollAuthDict?: (authDict: AuthDict) => Promise<void>;
}) {
  const { errorCode, session } = stageData;

  const sid = emailTokenState.status === AsyncStatus.Success ? emailTokenState.data.result.sid : '';
  const authDict: AuthDict | undefined = useMemo(() => {
    if (!sid) return undefined;
    const threepIDCreds = { sid, client_secret: clientSecret };
    return {
      type: AuthType.Email,
      threepid_creds: threepIDCreds,
      threepidCreds: threepIDCreds,
      session,
    };
  }, [sid, clientSecret, session]);

  const handleEmailSubmit = useCallback(
    (userEmail: string) => {
      requestEmailToken(userEmail, clientSecret).catch(() => undefined);
    },
    [clientSecret, requestEmailToken]
  );

  useEffect(() => {
    if (email && !errorCode && emailTokenState.status === AsyncStatus.Idle) {
      handleEmailSubmit(email);
    }
  }, [email, errorCode, emailTokenState, handleEmailSubmit]);

  // Poll while the person is off in their inbox, and check right away when they come back.
  useEffect(() => {
    if (!authDict || !pollAuthDict) return undefined;
    let inFlight = false;
    const poll = () => {
      if (inFlight) return;
      inFlight = true;
      pollAuthDict(authDict).finally(() => {
        inFlight = false;
      });
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [authDict, pollAuthDict]);

  if (emailTokenState.status === AsyncStatus.Loading) {
    return (
      <Box direction="Column" alignItems="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text style={{ color: color.Secondary.Main }}>Sending verification email…</Text>
      </Box>
    );
  }

  if (emailTokenState.status === AsyncStatus.Error) {
    const { title, message } = describeEmailTokenError(emailTokenState.error, email);
    return (
      <EmailErrorDialog
        title={title}
        message={message}
        defaultEmail={email}
        onRetry={handleEmailSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (emailTokenState.status === AsyncStatus.Success && authDict) {
    const sentTo = emailTokenState.data.email;
    return (
      <Dialog>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          <Box direction="Column" gap="200">
            <Text size="H4">Check your inbox</Text>
            <Text>
              We sent a link to <b>{sentTo}</b>. Open it to confirm your address.
              {pollAuthDict
                ? ' This window continues on its own once you have.'
                : ' Then come back here and continue.'}
            </Text>
            {pollAuthDict && (
              <Box alignItems="Center" gap="200">
                <Spinner variant="Secondary" size="200" />
                <Text size="T300" style={{ color: color.Secondary.Main }}>
                  Waiting for you to click the link…
                </Text>
              </Box>
            )}
            <Text size="T200" priority="300">
              Nothing arrived after a minute? Look in your spam folder, or send it again.
            </Text>
            {errorCode && (
              <Text size="T300" style={{ color: color.Critical.Main }}>
                The link has not been opened yet. Click it in the email, then try again.
              </Text>
            )}
          </Box>
          <Button variant="Primary" onClick={() => submitAuthDict(authDict)}>
            <Text as="span" size="B400">
              I clicked the link
            </Text>
          </Button>
          <Box gap="200">
            <Button
              style={{ flexGrow: 1 }}
              variant="Secondary"
              fill="Soft"
              onClick={() => handleEmailSubmit(sentTo)}
            >
              <Text as="span" size="B400">
                Resend email
              </Text>
            </Button>
            <Button
              style={{ flexGrow: 1 }}
              variant="Secondary"
              fill="None"
              outlined
              onClick={onCancel}
            >
              <Text as="span" size="B400">
                Change email
              </Text>
            </Button>
          </Box>
        </Box>
      </Dialog>
    );
  }

  if (!email) {
    return (
      <EmailErrorDialog
        title="Add your email"
        message="Enter the email address we should send the verification link to."
        onRetry={handleEmailSubmit}
        onCancel={onCancel}
      />
    );
  }

  return null;
}

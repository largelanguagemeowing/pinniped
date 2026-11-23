import React, { FormEventHandler, useCallback } from 'react';
import { Box, Button, config, Dialog, Input, Spinner, Text, color } from 'folds';
import { MatrixClient, MatrixError } from 'matrix-js-sdk';
import { SplashScreen } from '../../components/splash-screen';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { CustomLoginResponse, login } from '../auth/login/loginUtil';
import { setFallbackSession } from '../../state/sessions';
import { logoutClient } from '../../../client/initMatrix';

type SoftLogoutProps = {
  mx: MatrixClient;
  reason: string;
};
// The server ended the session but kept the device, so signing in again with
// the same device id keeps the local encryption keys.
export function SoftLogout({ mx, reason }: SoftLogoutProps) {
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId();

  const [loginState, startLogin] = useAsyncCallback<
    CustomLoginResponse,
    MatrixError,
    Parameters<typeof login>
  >(useCallback(login, []));

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const password = new FormData(evt.currentTarget).get('password');
    if (typeof password !== 'string' || password === '') return;
    startLogin(mx.baseUrl, {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: userId },
      password,
      ...(deviceId ? { device_id: deviceId } : {}),
    })
      .then((res) => {
        if (!res) return;
        setFallbackSession(
          res.response.access_token,
          res.response.device_id,
          res.response.user_id,
          res.baseUrl
        );
        window.location.reload();
      })
      .catch(() => undefined);
  };

  const signingIn = loginState.status === AsyncStatus.Loading;

  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Dialog>
          <Box
            as="form"
            direction="Column"
            gap="400"
            style={{ padding: config.space.S400 }}
            onSubmit={handleSubmit}
          >
            <Text size="H4">Signed out</Text>
            <Text>{reason}</Text>
            <Text>
              Sign in as {userId} to continue; your encrypted messages on this device are kept.
            </Text>
            <Input
              name="password"
              type="password"
              size="400"
              variant="Background"
              radii="400"
              placeholder="Password"
              autoComplete="current-password"
              aria-label="Password"
              required
              autoFocus
            />
            {loginState.status === AsyncStatus.Error && (
              <Text role="alert" size="T300" style={{ color: color.Critical.Main }}>
                Sign in failed. Check your password, or log out below.
              </Text>
            )}
            <Button
              type="submit"
              variant="Primary"
              disabled={signingIn}
              before={signingIn ? <Spinner fill="Solid" variant="Primary" size="200" /> : undefined}
            >
              <Text as="span" size="B400">
                Sign in
              </Text>
            </Button>
            <Button type="button" variant="Critical" fill="None" onClick={() => logoutClient(mx)}>
              <Text as="span" size="B400">
                Log out and delete local data
              </Text>
            </Button>
          </Box>
        </Dialog>
      </Box>
    </SplashScreen>
  );
}

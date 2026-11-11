import { MatrixClient, MatrixError } from 'matrix-js-sdk';
import { useCallback, useRef, useState } from 'react';
import { AsyncState, AsyncStatus } from './useAsyncCallback';
import { useAlive } from './useAlive';
import { RequestEmailTokenCallback, RequestEmailTokenResponse } from './types';

export const useRegisterEmail = (
  mx: MatrixClient
): [AsyncState<RequestEmailTokenResponse, MatrixError>, RequestEmailTokenCallback, () => void] => {
  const alive = useAlive();
  const sendAttemptRef = useRef(1);
  const reqRef = useRef(0);
  const [state, setState] = useState<AsyncState<RequestEmailTokenResponse, MatrixError>>({
    status: AsyncStatus.Idle,
  });

  const registerEmail: RequestEmailTokenCallback = useCallback(
    async (email, clientSecret, nextLink) => {
      reqRef.current += 1;
      const req = reqRef.current;
      const sendAttempt = sendAttemptRef.current;
      sendAttemptRef.current += 1;
      setState({ status: AsyncStatus.Loading });
      try {
        const result = await mx.requestRegisterEmailToken(
          email,
          clientSecret,
          sendAttempt,
          nextLink
        );
        const data = { email, clientSecret, result };
        if (alive() && req === reqRef.current) setState({ status: AsyncStatus.Success, data });
        return data;
      } catch (e) {
        if (alive() && req === reqRef.current) {
          setState({ status: AsyncStatus.Error, error: e as MatrixError });
        }
        throw e;
      }
    },
    [mx, alive]
  );

  const reset = useCallback(() => {
    reqRef.current += 1;
    setState({ status: AsyncStatus.Idle });
  }, []);

  return [state, registerEmail, reset];
};

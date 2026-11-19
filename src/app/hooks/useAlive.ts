import { useCallback, useLayoutEffect, useRef } from 'react';

// layout cleanup runs before child class components' componentWillUnmount, so callbacks they fire while tearing down already see false
export const useAlive = (): (() => boolean) => {
  const aliveRef = useRef<boolean>(true);

  useLayoutEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const alive = useCallback(() => aliveRef.current, []);
  return alive;
};

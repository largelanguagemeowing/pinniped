import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { SpecVersions, specVersions } from '../cs-api';

// While the user continues without versions, keep asking: the versions decide
// things like authenticated media, which a guess of "none" gets wrong.
const BACKGROUND_RETRY_MS = 10_000;

type SpecVersionsLoaderProps = {
  baseUrl: string;
  fallback?: () => ReactNode;
  error?: (err: unknown, retry: () => void, ignore: () => void) => ReactNode;
  children: (versions: SpecVersions) => ReactNode;
};
export function SpecVersionsLoader({
  baseUrl,
  fallback,
  error,
  children,
}: SpecVersionsLoaderProps) {
  const [state, loadVersions] = useAsyncCallback(
    useCallback(() => specVersions(fetch, baseUrl), [baseUrl])
  );
  // a failure is reported through state
  const load = useCallback(() => {
    loadVersions().catch(() => undefined);
  }, [loadVersions]);
  const [ignoreError, setIgnoreError] = useState(false);

  const ignoreCallback = useCallback(() => setIgnoreError(true), []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ignoreError || state.status !== AsyncStatus.Error) return undefined;
    const timer = setTimeout(load, BACKGROUND_RETRY_MS);
    return () => clearTimeout(timer);
  }, [ignoreError, state.status, load]);

  if (!ignoreError && (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading)) {
    return fallback?.();
  }

  if (!ignoreError && state.status === AsyncStatus.Error) {
    return error?.(state.error, load, ignoreCallback);
  }

  return children(state.status === AsyncStatus.Success ? state.data : { versions: [] });
}

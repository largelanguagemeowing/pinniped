import { QueryClient } from '@tanstack/react-query';

const MAX_RETRIES = 2;
// Responses a repeat cannot change: the request itself is wrong or refused.
const isFinalStatus = (status: number): boolean =>
  status >= 400 && status < 500 && status !== 408 && status !== 429;

/** Retries network errors and 5xx; a 4xx from the server is final. */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  const status = (error as { httpStatus?: unknown } | null)?.httpStatus;
  if (typeof status === 'number' && isFinalStatus(status)) return false;
  return failureCount < MAX_RETRIES;
};

// Server answers (summaries, protocol lists) stay fresh for a minute, so remounting the same
// card does not ask again; queries that need fresher data set their own `staleTime`.
export const QUERY_STALE_TIME_MS = 60_000;

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: QUERY_STALE_TIME_MS },
    },
  });

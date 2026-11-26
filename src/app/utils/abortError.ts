/**
 * Whether a request ended because it was aborted. `fetch`, `AbortSignal` and the SDK's upload all
 * reject with an error of this name; it is compared by name because a `DOMException` from another
 * realm is not an instance of this one's.
 */
export const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

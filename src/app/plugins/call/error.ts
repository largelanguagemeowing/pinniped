/** A problem the call widget reports without leaving the call, e.g. not being allowed to speak. */
export type CallError = {
  code: string;
  title: string;
  message?: string;
};

/** Reads the call widget's `club.stablecat.pinniped.call_error` payload; anything malformed counts as no error. */
export const parseCallError = (data: unknown): CallError | undefined => {
  const { error } = (data ?? {}) as Record<string, unknown>;
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, title, message } = error as Record<string, unknown>;
  if (typeof code !== 'string' || typeof title !== 'string') return undefined;
  return { code, title, message: typeof message === 'string' ? message : undefined };
};

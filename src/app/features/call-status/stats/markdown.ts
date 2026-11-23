/** Markdown table cells cannot contain pipes or newlines; backslashes go first so they cannot undo the pipe escape. */
export const cell = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

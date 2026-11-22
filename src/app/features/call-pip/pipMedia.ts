/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export interface PipUser {
  id: string;
  /** Yourself. */
  local: boolean;
  /** Camera on. */
  videoEnabled: boolean;
  /** When the person began their current speech; null while silent. */
  speakingSince: number | null;
}

export interface PipShare {
  id: string;
  local: boolean;
}

export interface PipInput {
  /** What the user clicked to focus in the call view, if anything. */
  focusedId: string | null;
  users: readonly PipUser[];
  shares: readonly PipShare[];
  /** What the window showed last time, kept while it is still a fine choice. */
  previousId: string | null;
}

/** Whether there is anything to show: somebody's camera (yours too) or a screen share. */
export const pipHasVideo = (users: readonly PipUser[], shares: readonly PipShare[]): boolean =>
  shares.length > 0 || users.some((u) => u.videoEnabled);

/**
 * Who the floating window shows, in order of preference:
 * 1. what the user focused, when it has video;
 * 2. a screen share from someone else (the newest);
 * 3. among the others with a camera on, whoever began speaking most recently; with nobody
 *    speaking, the previous choice if it is still eligible, else the first;
 * 4. your own camera, else your own screen share.
 * Null when nothing has video.
 */
export function pickPipMedia({ focusedId, users, shares, previousId }: PipInput): string | null {
  if (focusedId !== null) {
    const user = users.find((u) => u.id === focusedId);
    if (user?.videoEnabled) return user.id;
    if (shares.some((s) => s.id === focusedId)) return focusedId;
  }

  const remoteShares = shares.filter((s) => !s.local);
  if (remoteShares.length > 0) return remoteShares[remoteShares.length - 1].id;

  const others = users.filter((u) => !u.local && u.videoEnabled);
  const speaking = others.filter((u) => u.speakingSince !== null);
  if (speaking.length > 0)
    return speaking.reduce((best, u) => (u.speakingSince! > best.speakingSince! ? u : best)).id;
  const previous = others.find((u) => u.id === previousId);
  if (previous) return previous.id;
  if (others.length > 0) return others[0].id;

  const self = users.find((u) => u.local && u.videoEnabled);
  if (self) return self.id;
  return shares.find((s) => s.local)?.id ?? null;
}

import { Descendant } from 'slate';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/atomWithLocalStorage';

/**
 * Unsent composer text, by room ID, kept in localStorage so it survives a reload
 * or a restart. Signing out clears localStorage, and these with it.
 */
const STORAGE_KEY = 'messageDrafts';

type StoredDrafts = Record<string, Descendant[]>;

const readDrafts = (): StoredDrafts => {
  const stored = getLocalStorageItem<unknown>(STORAGE_KEY, undefined);
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? (stored as StoredDrafts)
    : {};
};

export const loadMsgDraft = (roomId: string): Descendant[] => {
  const draft = readDrafts()[roomId];
  return Array.isArray(draft) ? draft : [];
};

/** Stores the room's draft; an empty one removes it. */
export const storeMsgDraft = (roomId: string, draft: Descendant[]): void => {
  const drafts = readDrafts();
  if (draft.length === 0) {
    if (!(roomId in drafts)) return;
    delete drafts[roomId];
  } else {
    drafts[roomId] = draft;
  }
  try {
    setLocalStorageItem(STORAGE_KEY, drafts);
  } catch {
    // Storage is full or unavailable: the draft still lives in memory for this session.
  }
};

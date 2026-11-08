import { atom } from 'jotai';
import type { SettingsPages } from '../features/settings';

/** The settings modal: open on a given page, or closed. Shared so any part of the app can open it. */
export const settingsModalAtom = atom<{ page?: SettingsPages } | undefined>(undefined);

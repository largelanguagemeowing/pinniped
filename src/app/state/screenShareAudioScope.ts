import { atom } from 'jotai';
import type { ScreenShareAudioApp } from '../utils/device';

/**
 * Whose audio the next or running screen share carries on desktop: every other application, or
 * only the one chosen in the screen share dialog. A choice of one lasts until that share ends.
 */
export type ScreenShareAudioScope = { kind: 'all' } | { kind: 'app'; app: ScreenShareAudioApp };

export const screenShareAudioScopeAtom = atom<ScreenShareAudioScope>({ kind: 'all' });

import React, { ReactNode } from 'react';
import { getDefaultStore, Provider } from 'jotai';

/**
 * The store all app state lives in. Code outside React reads it directly (the call core reads
 * the settings from it), so the React tree must use this store too, not one of its own.
 */
export const appStore = getDefaultStore();

export function AppStoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={appStore}>{children}</Provider>;
}

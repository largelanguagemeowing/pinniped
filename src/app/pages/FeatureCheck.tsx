import React, { ReactNode, useEffect } from 'react';
import { Box, Dialog, Text, config } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { checkIndexedDBSupport, IndexedDBStatus } from '../utils/featureCheck';
import { SplashScreen } from '../components/splash-screen';

export function FeatureCheck({ children }: { children: ReactNode }) {
  const [idbSupportState, checkIDBSupport] = useAsyncCallback(checkIndexedDBSupport);

  useEffect(() => {
    checkIDBSupport();
  }, [checkIDBSupport]);

  if (
    idbSupportState.status === AsyncStatus.Success &&
    idbSupportState.data !== IndexedDBStatus.Supported
  ) {
    const storageUnavailable = idbSupportState.data === IndexedDBStatus.Unavailable;
    return (
      <SplashScreen>
        <Box grow="Yes" alignItems="Center" justifyContent="Center">
          <Dialog>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text>
                {storageUnavailable ? 'Browser Storage Unavailable' : 'Missing Browser Feature'}
              </Text>
              <Text size="T300" priority="400">
                {storageUnavailable
                  ? 'Pinniped could not write to browser storage. Free some disk space, then reload Pinniped. Messages may not be sent or saved until storage is available.'
                  : 'No IndexedDB support found. This application requires IndexedDB to store session data locally. Please make sure your browser supports IndexedDB and has it enabled.'}
              </Text>
              {!storageUnavailable && (
                <Text size="T200">
                  <a
                    href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    What is IndexedDB?
                  </a>
                </Text>
              )}
            </Box>
          </Dialog>
        </Box>
      </SplashScreen>
    );
  }

  return children;
}

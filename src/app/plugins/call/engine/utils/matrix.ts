/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { calculateRetryBackoff } from 'matrix-js-sdk';
import { sleep } from 'matrix-js-sdk/lib/utils';

/**
 * Perform a network operation with retries on ConnectionError.
 * If the error is not retryable, or the max number of retries is reached, the error is rethrown.
 * Supports handling of matrix quotas.
 */
export async function doNetworkOperationWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let currentRetryCount = 0;

  while (true) {
    try {
      return await operation();
    } catch (e) {
      currentRetryCount++;
      const backoff = calculateRetryBackoff(e, currentRetryCount, true);
      if (backoff < 0) {
        // Max number of retries reached, or error is not retryable. rethrow the error
        throw e;
      }
      // wait for the specified time and then retry the request
      await sleep(backoff);
    }
  }
}

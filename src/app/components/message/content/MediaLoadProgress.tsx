import React from 'react';
import { Badge, Text } from 'folds';
import { useMediaProgress } from '../../../hooks/useMediaProgress';
import { progressPercent } from '../../../utils/mediaProgress';
import { bytesToSize } from '../../../utils/common';

/**
 * How far the download of `url` is: the share of an announced length, else the bytes so far;
 * nothing while nothing is downloading. It follows the download by itself, so only this figure
 * renders as it advances.
 */
export function MediaLoadProgress({ url }: { url: string | null }) {
  const state = useMediaProgress(url);
  if (state.status !== 'loading') return null;
  const { progress } = state;
  // nothing to say before the first bytes of an unannounced length
  if (progress.length === 'unknown' && progress.loaded === 0) return null;

  return (
    <Badge variant="Secondary" fill="Soft">
      <Text size="L400">
        {progress.length === 'known'
          ? `${progressPercent(progress)}%`
          : bytesToSize(progress.loaded)}
      </Text>
    </Badge>
  );
}

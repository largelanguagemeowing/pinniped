import { useCallback } from 'react';
import { accessibleColor } from '../plugins/color';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { useTheme } from './useTheme';

export type ReadableColor = (color: string) => string;

/** Maps a color someone else set to one the active theme can show; as set when the setting is off. */
export const useReadableColor = (): ReadableColor => {
  const [readableColors] = useSetting(settingsAtom, 'readableColors');
  const { kind } = useTheme();

  return useCallback(
    (color) => (readableColors ? accessibleColor(kind, color) : color),
    [readableColors, kind]
  );
};

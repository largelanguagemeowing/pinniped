import { useCallback } from 'react';
import { selectFile } from '../utils/dom';
import { stripMetadata } from '../utils/stripMetadata';

export const useFilePicker = <M extends boolean | undefined = undefined>(
  onSelect: (file: M extends true ? File[] : File) => void,
  multiple?: M
) =>
  useCallback(
    async (accept: string) => {
      const file = await selectFile(accept, multiple);
      if (!file) return;
      onSelect(file);
    },
    [multiple, onSelect]
  );

/** Picks a single image; it arrives without its metadata (location, camera, time). */
export const useImageFilePicker = (onSelect: (file: File) => void) =>
  useFilePicker(
    useCallback(
      async (file: File) => {
        onSelect(await stripMetadata(file));
      },
      [onSelect]
    ),
    false
  );

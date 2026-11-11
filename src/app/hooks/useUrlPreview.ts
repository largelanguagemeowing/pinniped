import { useCallback } from 'react';
import { Room } from 'matrix-js-sdk';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';

/**
 * Whether link previews, and the embeds that follow the same setting, show for messages in a
 * room. A preview asks a server about the link, so encrypted rooms have a setting of their own,
 * off by default, and every view of messages has to ask with the message's room.
 */
export const useUrlPreviewSetting = (): ((room: Room) => boolean) => {
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  return useCallback(
    (room: Room) => (room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview),
    [urlPreview, encUrlPreview]
  );
};

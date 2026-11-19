import { useCallback } from 'react';
import type { Call } from '../../plugins/call/Call';
import { PackSound, Sound } from '../../plugins/sound-pack';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { logSound } from '../../sound/log';
import { decryptFile, downloadMedia, mxcUrlToHttp } from '../../utils/matrix';

const MAX_RECENT = 12;

/** Downloaded sounds as blob: URLs, which the call decodes. */
const blobUrls = new Map<string, Promise<string>>();

export const useSoundBlobUrl = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  return useCallback(
    (mxc: string, file?: PackSound['file']): Promise<string> => {
      let blobUrl = blobUrls.get(mxc);
      if (!blobUrl) {
        const http = mxcUrlToHttp(mx, mxc, useAuthentication);
        if (!http) return Promise.reject(new Error('Sound URL could not be resolved'));
        blobUrl = downloadMedia(http)
          .then((blob) =>
            file ? blob.arrayBuffer().then((buf) => decryptFile(buf, 'audio/mpeg', file)) : blob
          )
          .then((blob) => URL.createObjectURL(blob));
        blobUrls.set(mxc, blobUrl);
        blobUrl.catch(() => blobUrls.delete(mxc));
      }
      return blobUrl;
    },
    [mx, useAuthentication]
  );
};

/** Plays soundboard sounds into the call: everyone in it hears them, and so do you. */
export const useSoundPlayer = (call: Call) => {
  const getBlobUrl = useSoundBlobUrl();
  const [recent, setRecent] = useSetting(settingsAtom, 'soundboardRecent');

  const play = useCallback(
    async (sound: Sound) => {
      logSound('play', `soundboard ${sound.key}`, sound.name);
      const url = await getBlobUrl(sound.url, sound.file);
      call.vm.soundboard({ op: 'play', url, mode: sound.mode });
      setRecent([sound.key, ...recent.filter((k) => k !== sound.key)].slice(0, MAX_RECENT));
    },
    [call, getBlobUrl, recent, setRecent]
  );

  const stop = useCallback(() => {
    logSound('stop', 'soundboard');
    call.vm.soundboard({ op: 'stop' });
  }, [call]);

  return { play, stop };
};

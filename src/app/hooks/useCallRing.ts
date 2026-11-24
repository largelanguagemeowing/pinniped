import { RefObject, useCallback, useEffect, useState } from 'react';
import { logSound } from '../sound/log';

/**
 * Loops the incoming call's ring on `audioRef` while `shouldRing` holds, until silenced.
 * Silencing only stops the sound; the call prompt stays up.
 */
export const useCallRing = (
  audioRef: RefObject<HTMLAudioElement | null>,
  shouldRing: boolean
): { ringing: boolean; silence: () => void } => {
  const [silenced, setSilenced] = useState(false);
  const ringing = shouldRing && !silenced;

  useEffect(() => {
    if (!ringing) return undefined;
    const audioElement = audioRef.current;
    logSound('play', 'call (ring)');
    audioElement?.play();
    // A detached <audio> keeps playing, so the ring must be stopped explicitly.
    return () => {
      logSound('stop', 'call (ring)');
      audioElement?.pause();
    };
  }, [audioRef, ringing]);

  const silence = useCallback(() => setSilenced(true), []);

  return { ringing, silence };
};

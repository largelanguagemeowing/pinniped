import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { callFullscreenAtom } from '../../state/call';

const isOurs = (): boolean => document.fullscreenElement === document.documentElement;

/**
 * Fullscreens the call view: the whole document goes fullscreen, and while it is the app layout
 * leaves only the call view on screen (`callFullscreenAtom`). Not the call element itself:
 * popouts, tooltips and modals are portaled to the body and would not show. Unmounting (the call
 * ended or its view closed) leaves fullscreen.
 */
export function useCallFullscreen(): [fullscreen: boolean, toggle: () => void] {
  const [fullscreen, setFullscreen] = useAtom(callFullscreenAtom);

  useEffect(() => {
    const onChange = () => setFullscreen(isOurs());
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      setFullscreen(false);
      if (isOurs()) document.exitFullscreen();
    };
  }, [setFullscreen]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }, []);

  return [fullscreen, toggle];
}

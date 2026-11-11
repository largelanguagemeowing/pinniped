import { useCallback, useEffect, useRef } from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { navHistory } from '../state/navHistory';
import { useKeyDown } from './useKeyDown';
import { useRoomNavigate } from './useRoomNavigate';
import { useRouteSelectedRoom } from './router/useSelectedRoom';

/**
 * alt+left/alt+right navigation through the rooms the user has
 * viewed, independent of the browser's URL history:
 * - alt+left moves back to the previously viewed room
 * - alt+right moves forward again
 */
export const useRoomNavHistory = () => {
  const selectedRoomId = useRouteSelectedRoom();
  const previousRoomRef = useRef<string | undefined>(undefined);
  const { navigateRoom } = useRoomNavigate();

  // Record the room the user left. Back/forward navigation never reaches the
  // record path because navHistory skips the change it causes itself.
  useEffect(() => {
    navHistory.record(previousRoomRef.current);
    previousRoomRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useKeyDown(
    window,
    useCallback(
      (evt: KeyboardEvent) => {
        const back = isKeyHotkey(['alt+arrowleft'], evt);
        const forward = isKeyHotkey(['alt+arrowright'], evt);
        if (!back && !forward) return;

        evt.preventDefault();

        const targetRoomId = back
          ? navHistory.back(selectedRoomId)
          : navHistory.forward(selectedRoomId);
        if (targetRoomId) navigateRoom(targetRoomId);
      },
      [selectedRoomId, navigateRoom]
    )
  );
};

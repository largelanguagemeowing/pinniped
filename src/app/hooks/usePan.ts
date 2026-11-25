import { MouseEventHandler, useEffect, useRef, useState } from 'react';

export type Pan = {
  translateX: number;
  translateY: number;
};

const INITIAL_PAN = {
  translateX: 0,
  translateY: 0,
};

export const usePan = (active: boolean) => {
  const [pan, setPan] = useState<Pan>(INITIAL_PAN);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'initial'>(
    active ? 'grab' : 'initial'
  );

  // Detaches the in-progress drag's document listeners, if any.
  const stopDragRef = useRef<() => void>(undefined);

  const handleMouseMove = (evt: MouseEvent) => {
    // Primary button no longer held: the mouseup was lost (released over an
    // iframe or outside the window), so end the drag instead of leaking.
    if (evt.buttons % 2 === 0) {
      stopDragRef.current?.();
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();

    setPan((p) => {
      const { translateX, translateY } = p;
      const mX = translateX + evt.movementX;
      const mY = translateY + evt.movementY;

      return { translateX: mX, translateY: mY };
    });
  };

  const handleMouseUp = (evt: MouseEvent) => {
    evt.preventDefault();
    stopDragRef.current?.();
  };

  const handleMouseDown: MouseEventHandler<HTMLElement> = (evt) => {
    if (!active) return;
    evt.preventDefault();
    stopDragRef.current?.();
    setCursor('grabbing');

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    stopDragRef.current = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      stopDragRef.current = undefined;
      setCursor('grab');
    };
  };

  // Don't leave document listeners behind if the viewer closes mid-drag.
  useEffect(() => () => stopDragRef.current?.(), []);

  // Not pannable any more: end a drag still running, so its listeners stop moving the image.
  useEffect(() => {
    if (!active) {
      stopDragRef.current?.();
      setPan(INITIAL_PAN);
    }
    setCursor(active ? 'grab' : 'initial');
  }, [active]);

  return {
    pan,
    cursor,
    onMouseDown: handleMouseDown,
  };
};

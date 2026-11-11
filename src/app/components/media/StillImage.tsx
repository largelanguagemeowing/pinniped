import React, { useLayoutEffect, useRef } from 'react';
import * as css from './media.css';

type StillImageProps = {
  /** A loaded image; its current frame is drawn once and fitted the same way. */
  source: HTMLImageElement;
};

/** A still copy of `source`, so an animated image can be shown without moving. */
export function StillImage({ source }: StillImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = source;
    if (!canvas || !context || naturalWidth === 0 || naturalHeight === 0) return;

    // enough pixels to cover the rendered box at this display density, never more than the source
    const scale = Math.min(
      1,
      Math.max(clientWidth / naturalWidth, clientHeight / naturalHeight) * window.devicePixelRatio
    );
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    canvas.style.objectFit = getComputedStyle(source).objectFit;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }, [source]);

  return <canvas ref={canvasRef} className={css.Image} aria-hidden />;
}

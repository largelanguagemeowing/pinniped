import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

// Full-screen image viewer. No modal card: the viewer itself
// is the dark surface, the controls live in a header bar at the top and the
// image is centred in the remaining space below it. Clicking the dark area
// around the image closes the viewer (handled in ImageViewer.tsx).
export const ImageViewer = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    position: 'relative',
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const ImageViewerContent = style([
  DefaultReset,
  {
    // Fill the space below the header; minHeight 0 lets the image's
    // maxHeight: 100% resolve against this box instead of overflowing it.
    flex: '1 1 0',
    minHeight: 0,
    width: '100%',
    overflow: 'hidden',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    objectFit: 'contain',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    transition: 'transform 100ms linear',
    userSelect: 'none',
  },
]);

// Vencord-style magnifier lens. Rendered via a portal to document.body so it
// floats above the modal overlay (which sits at folds' ZIndex.Max = 9999).
// No border is used so the element is exactly `size x size` and the lens
// centring math stays exact; the ring is drawn with box-shadow instead.
export const MagnifierLens = style([
  DefaultReset,
  {
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 10000,
    borderRadius: '50%',
    overflow: 'hidden',
    pointerEvents: 'none',
    boxShadow:
      '0 0 0 2px rgba(180, 180, 180, 0.9), inset 0 0 10px 2px rgba(128, 128, 128, 0.5), 0 2px 8px rgba(0, 0, 0, 0.6)',
    willChange: 'transform',
  },
]);

export const MagnifierImg = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none',
    userSelect: 'none',
  },
]);

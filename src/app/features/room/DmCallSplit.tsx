import React, { PointerEventHandler, ReactNode, useCallback, useRef, useState } from 'react';
import { Box, color, config, toRem } from 'folds';

const STORAGE_KEY = 'pinniped.dmCallPaneHeight';
const MIN_CALL_HEIGHT = 200;
const MIN_CHAT_HEIGHT = 160;
const DEFAULT_CALL_HEIGHT = 320;

const loadHeight = (): number => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_CALL_HEIGHT ? stored : DEFAULT_CALL_HEIGHT;
  } catch {
    return DEFAULT_CALL_HEIGHT;
  }
};

type DmCallSplitProps = {
  call: ReactNode;
  chat: ReactNode;
};

/** DM layout: call on top, chat below, draggable divider between them. */
export function DmCallSplit({ call, chat }: DmCallSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(loadHeight);
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback((value: number) => {
    const total = containerRef.current?.clientHeight ?? Infinity;
    return Math.max(MIN_CALL_HEIGHT, Math.min(value, total - MIN_CHAT_HEIGHT));
  }, []);

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (evt) => {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    setDragging(true);
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (evt) => {
    const container = containerRef.current;
    if (!dragging || !container) return;
    setHeight(clamp(evt.clientY - container.getBoundingClientRect().top));
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (evt) => {
    evt.currentTarget.releasePointerCapture(evt.pointerId);
    setDragging(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
    } catch {
      // persisting the split position is a convenience only
    }
  };

  return (
    <Box ref={containerRef} grow="Yes" direction="Column" style={{ minHeight: 0 }}>
      <Box
        shrink="No"
        direction="Column"
        style={{ height: toRem(height), maxHeight: `calc(100% - ${toRem(MIN_CHAT_HEIGHT)})` }}
      >
        {/* the call iframe floats above this pane, don't let it swallow the drag */}
        <Box grow="Yes" style={{ pointerEvents: dragging ? 'none' : undefined, minHeight: 0 }}>
          {call}
        </Box>
      </Box>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize call"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        style={{
          flexShrink: 0,
          height: toRem(6),
          marginBlock: toRem(-3),
          position: 'relative',
          zIndex: 1,
          cursor: 'row-resize',
          touchAction: 'none',
          background: dragging ? color.Primary.Main : 'transparent',
          borderRadius: config.radii.R300,
        }}
      />
      <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
        {chat}
      </Box>
    </Box>
  );
}

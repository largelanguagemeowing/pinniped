import React, {
  PointerEventHandler,
  ReactNode,
  startTransition,
  useCallback,
  useRef,
  useState,
} from 'react';
import { Box, color, config, toRem } from 'folds';
import { recordStage } from '../call/stage/renderTrail';

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
  /** The call takes the whole height; the chat is hidden but stays mounted, keeping its place. */
  callOnly: boolean;
  /** The call is an overview that has to show in full: the pane never gets smaller than it. */
  fitCall: boolean;
};

/** DM layout: call on top, chat below, draggable divider between them. */
export function DmCallSplit({ call, chat, callOnly, fitCall }: DmCallSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callPaneRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(loadHeight);
  const [dragging, setDragging] = useState(false);

  /** The call height for a pointer at `clientY`, within the limits. */
  const heightAt = useCallback((clientY: number): number | undefined => {
    const container = containerRef.current;
    if (!container) return undefined;
    const value = clientY - container.getBoundingClientRect().top;
    return Math.max(MIN_CALL_HEIGHT, Math.min(value, container.clientHeight - MIN_CHAT_HEIGHT));
  }, []);

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (evt) => {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    setDragging(true);
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (evt) => {
    const next = dragging ? heightAt(evt.clientY) : undefined;
    if (next === undefined) return;
    recordStage('drag split', String(Math.round(next)));
    // A transition: every new size re-renders the call view in several commits, and with an
    // urgent drag update queued at the end of each, React took the drag for an endless update
    // loop (error #185).
    startTransition(() => setHeight(next));
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (evt) => {
    evt.currentTarget.releasePointerCapture(evt.pointerId);
    setDragging(false);
    // The last move may still be pending; the release is where the divider ends up. The pane
    // may be taller than that when the overview needs the room.
    const final = Math.max(heightAt(evt.clientY) ?? height, callPaneRef.current?.offsetHeight ?? 0);
    setHeight(final);
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(final)));
    } catch {
      // persisting the split position is a convenience only
    }
  };

  return (
    <Box ref={containerRef} grow="Yes" direction="Column" style={{ minHeight: 0 }}>
      <Box
        ref={callPaneRef}
        shrink="No"
        direction="Column"
        style={
          callOnly
            ? { flexGrow: 1, minHeight: 0 }
            : {
                height: toRem(height),
                maxHeight: `calc(100% - ${toRem(MIN_CHAT_HEIGHT)})`,
                minHeight: fitCall ? 'min-content' : undefined,
              }
        }
      >
        <Box grow="Yes" style={{ minHeight: 0 }}>
          {call}
        </Box>
      </Box>
      {!callOnly && (
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
      )}
      <Box
        grow="Yes"
        direction="Column"
        style={{ minHeight: 0, display: callOnly ? 'none' : undefined }}
      >
        {chat}
      </Box>
    </Box>
  );
}

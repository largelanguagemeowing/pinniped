/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { animated, to, useSpring } from '@react-spring/web';
import { useAtom, useAtomValue } from 'jotai';
import { type Room } from 'matrix-js-sdk';
import { Icon, Icons, Text } from 'folds';

import { type Call } from '../../plugins/call/Call';
import { constant } from '../../plugins/call/engine/state/Behavior';
import { type ScreenShareViewModel } from '../../plugins/call/engine/state/media/ScreenShareViewModel';
import { type UserMediaViewModel } from '../../plugins/call/engine/state/media/UserMediaViewModel';
import { type MemberMediaViewModel } from '../../plugins/call/engine/state/media/MemberMediaViewModel';
import { SpotlightTileViewModel } from '../../plugins/call/engine/state/TileViewModel';
import { useBehavior } from '../../plugins/call/engine/useBehavior';
import { callStageMountsAtom } from '../../state/call';
import { mDirectAtom } from '../../state/mDirectList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { SpotlightTile } from '../call/stage/tile/SpotlightTile';
import { observePipMedia$, type PipSelection } from './observePipMedia';
import {
  type PipCorner,
  type PointerSample,
  type Size,
  cornerPosition,
  dragVelocity,
  fitPipWidth,
  isDragging,
  pipHeight,
  releaseCorner,
  resizedPipWidth,
  snapPipWidth,
} from './pipGeometry';
import { pipCornerAtom, pipWidthAtom } from './pipState';
import * as css from './CallPip.css';

/** Controls fade out after this long without the pointer moving over the window. */
const IDLE_MS = 1800;
/** Only the last stretch of pointer movement says how fast a drag ended. */
const VELOCITY_WINDOW_MS = 100;

const oppositeCorner: Record<PipCorner, PipCorner> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
};

const useViewport = (): Size => {
  const [size, setSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const update = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
};

/** Whether the pointer has been still over the window for a moment. */
function useIdle(): { idle: boolean; activity: () => void; leave: () => void } {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activity = useCallback(() => {
    setIdle(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    setIdle(true);
  }, []);
  useEffect(() => {
    activity();
    return () => clearTimeout(timer.current);
  }, [activity]);
  return { idle, activity, leave };
}

function RoomTitle({ roomId }: { roomId: string }): ReactNode {
  const room = useMatrixClient().getRoom(roomId);
  return room ? <JoinedRoomTitle room={room} /> : <>{roomId}</>;
}

function JoinedRoomTitle({ room }: { room: Room }): ReactNode {
  return <>{useRoomName(room)}</>;
}

function ParticipantName({ media }: { media: MemberMediaViewModel }): ReactNode {
  return <>{useBehavior(media.displayName$)}</>;
}

interface PipWindowProps {
  call: Call;
  media: UserMediaViewModel | ScreenShareViewModel;
}

/** The floating call window: a tile of the call's video you can drag to a corner and resize. */
function PipWindow({ call, media }: PipWindowProps): ReactNode {
  const { navigateRoom } = useRoomNavigate();
  const dm = useAtomValue(mDirectAtom).has(call.roomId);
  const [corner, setCorner] = useAtom(pipCornerAtom);
  const [storedWidth, setStoredWidth] = useAtom(pipWidthAtom);
  const viewport = useViewport();
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const { idle, activity, leave } = useIdle();

  const fittedWidth = fitPipWidth(storedWidth, viewport.width);
  const width = liveWidth ?? fittedWidth;
  const size = { width, height: pipHeight(width) };
  const rest = cornerPosition(corner, viewport, size);

  // A viewport too small for the stored width shrinks it for good.
  useEffect(() => {
    if (fittedWidth !== storedWidth) setStoredWidth(fittedWidth);
  }, [fittedWidth, storedWidth, setStoredWidth]);

  const [spring, api] = useSpring(() => ({
    x: rest.x,
    y: rest.y,
    // A light settle: about 7% past the corner, then rest (damping ratio 0.64).
    config: { tension: 375, friction: 25 },
  }));
  useEffect(() => {
    if (!dragging) api.start({ x: rest.x, y: rest.y, immediate: liveWidth !== null });
  }, [api, rest.x, rest.y, dragging, liveWidth]);

  const drag = useRef<{
    start: { x: number; y: number };
    origin: { x: number; y: number };
    samples: PointerSample[];
    active: boolean;
  } | null>(null);
  // A drag ends with a click on the window; it must not count as one.
  const justDragged = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    activity();
    if (e.button !== 0 || (e.target as Element).closest('button, [data-no-drag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      start: { x: e.clientX, y: e.clientY },
      origin: { x: spring.x.get(), y: spring.y.get() },
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      active: false,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    activity();
    const d = drag.current;
    if (d === null) return;
    const now = { x: e.clientX, y: e.clientY };
    d.samples = [...d.samples, { ...now, t: e.timeStamp }].filter(
      (s) => e.timeStamp - s.t <= VELOCITY_WINDOW_MS
    );
    if (!d.active && isDragging(d.start, now)) {
      d.active = true;
      setDragging(true);
    }
    if (d.active)
      api.start({
        x: d.origin.x + now.x - d.start.x,
        y: d.origin.y + now.y - d.start.y,
        immediate: true,
      });
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    drag.current = null;
    if (d === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.active) return;
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
    const position = { x: spring.x.get(), y: spring.y.get() };
    setCorner(releaseCorner(position, dragVelocity(d.samples), viewport));
    setDragging(false);
  };

  const resize = useRef<{ startX: number; startWidth: number } | null>(null);
  const onResizeDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { startX: e.clientX, startWidth: width };
    setLiveWidth(width);
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>): void => {
    const r = resize.current;
    if (r === null) return;
    setLiveWidth(resizedPipWidth(r.startWidth, e.clientX - r.startX, corner));
  };
  const onResizeUp = (e: PointerEvent<HTMLDivElement>): void => {
    const r = resize.current;
    resize.current = null;
    if (r === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    setStoredWidth(fitPipWidth(snapPipWidth(liveWidth ?? r.startWidth), viewport.width));
    setLiveWidth(null);
  };

  const goToCall = (e: MouseEvent): void => {
    if (justDragged.current || (e.target as Element).closest('button, [data-no-drag]')) return;
    navigateRoom(call.roomId);
  };

  const spotlight = useMemo(
    () => new SpotlightTileViewModel(constant([media]), constant(true)),
    [media]
  );

  return (
    <animated.div
      className={css.window}
      data-testid="callPip"
      data-dragging={dragging}
      data-resizing={liveWidth !== null}
      style={{
        width,
        transform: to([spring.x, spring.y], (x, y) => `translate3d(${x}px, ${y}px, 0)`),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={leave}
      onDoubleClick={goToCall}
    >
      <div className={css.tile}>
        <SpotlightTile
          className={css.media}
          vm={spotlight}
          expanded
          targetWidth={size.width}
          targetHeight={size.height}
          showIndicators={false}
          showNameTags={false}
          focusable
        />
        <div className={css.controls} data-idle={idle}>
          <div className={css.topBar}>
            <button
              type="button"
              className={css.title}
              onClick={goToCall}
              aria-label="Back to call"
            >
              <Icon size="200" src={Icons.ArrowLeft} aria-hidden />
              <Text as="span" size="T300" className={css.ellipsis}>
                <RoomTitle roomId={call.roomId} />
              </Text>
            </button>
          </div>
          <div className={css.bottomBar}>
            <Text as="span" size="T200" className={css.ellipsis}>
              {!dm && <ParticipantName media={media} />}
            </Text>
            <button
              type="button"
              className={css.hangup}
              aria-label="Leave call"
              onClick={() => call.hangup()}
            >
              <Icon size="200" src={Icons.PhoneDown} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div
        className={css.handle}
        data-no-drag
        data-corner={oppositeCorner[corner]}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
    </animated.div>
  );
}

/**
 * The call's video in a small window over the rest of the app while the call is out of view:
 * someone has a camera on or shares their screen, and no call view is open.
 */
export function CallPictureInPicture({ call }: { call: Call }): ReactNode {
  const stageMounts = useAtomValue(callStageMountsAtom);
  const [selection, setSelection] = useState<
    PipSelection<UserMediaViewModel, ScreenShareViewModel>
  >({
    media: null,
    hasVideo: false,
  });
  useEffect(() => {
    const subscription = observePipMedia$(call.vm).subscribe(setSelection);
    return () => subscription.unsubscribe();
  }, [call]);

  if (stageMounts > 0 || !selection.hasVideo || selection.media === null) return null;
  return (
    <div className={css.layer}>
      <PipWindow key={call.roomId} call={call} media={selection.media} />
    </div>
  );
}

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { animated } from '@react-spring/web';
import { BehaviorSubject } from 'rxjs';
import classNames from 'classnames';
import { Icon, Icons } from 'folds';
import { type TrackReference } from '@livekit/components-core';

import { type SpotlightTileViewModel } from '../../../../plugins/call/engine/state/TileViewModel';
import { type MemberMediaViewModel } from '../../../../plugins/call/engine/state/media/MemberMediaViewModel';
import { type UserMediaViewModel } from '../../../../plugins/call/engine/state/media/UserMediaViewModel';
import { type ScreenShareViewModel } from '../../../../plugins/call/engine/state/media/ScreenShareViewModel';
import { type RemoteScreenShareViewModel } from '../../../../plugins/call/engine/state/media/RemoteScreenShareViewModel';
import { type MediaViewModel } from '../../../../plugins/call/engine/state/media/MediaViewModel';
import { type RingingMediaViewModel } from '../../../../plugins/call/engine/state/media/RingingMediaViewModel';
import { type Behavior } from '../../../../plugins/call/engine/state/Behavior';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { VolumeSlider } from '../../../../components/slider';
import { useInitial, useLatest, useMergedRefs, useReactiveState } from '../hooks';
import { StageContext } from '../StageContext';
import { MediaView, type MediaViewProps } from './MediaView';
import * as mediaCss from './MediaView.css';
import * as css from './SpotlightTile.css';

const notMirrored: Behavior<boolean> = new BehaviorSubject(false);
const notWaiting: Behavior<boolean> = new BehaviorSubject(false);
const alwaysEnabled: Behavior<boolean> = new BehaviorSubject(true);

interface SpotlightItemBaseProps {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  'data-id': string;
  targetWidth: number;
  targetHeight: number;
  userId: string;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  showNameTags: boolean;
  focusable: boolean;
  'aria-hidden'?: boolean;
}

interface SpotlightMemberMediaItemBaseProps extends SpotlightItemBaseProps {
  video: TrackReference | undefined;
  unencryptedWarning: boolean;
}

function SpotlightUserMediaItem({
  vm,
  targetWidth,
  targetHeight,
  ...props
}: SpotlightMemberMediaItemBaseProps & { vm: UserMediaViewModel }): ReactNode {
  const videoFit = useBehavior(vm.videoFit$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  // The mute state shows on the spotlight's name tag too, like on the strip tiles.
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const deafened = useBehavior(vm.deafened$);
  const mirror = useBehavior(vm.local ? vm.mirror$ : notMirrored);
  const waitingForMedia = useBehavior(vm.local ? notWaiting : vm.waitingForMedia$);

  // Whenever target bounds change, inform the view model
  useEffect(() => {
    if (targetWidth > 0 && targetHeight > 0) vm.setTargetDimensions(targetWidth, targetHeight);
  }, [targetWidth, targetHeight, vm]);

  return (
    <MediaView
      videoFit={videoFit}
      videoEnabled={videoEnabled}
      mirror={mirror}
      waitingForMedia={waitingForMedia}
      nameTagLeadingIcon={
        deafened || !audioEnabled ? (
          <Icon
            className={mediaCss.leadingIcon}
            size="Inherit"
            src={deafened ? Icons.HeadphoneMute : Icons.MicMute}
            aria-label={deafened ? 'Deafened' : 'Microphone off'}
            data-muted
          />
        ) : undefined
      }
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      {...props}
    />
  );
}

/**
 * Reports the height of the screen share on show (Pinniped's call bar says e.g. "720p"), from
 * the video element inside the given tile.
 */
function useReportStreamHeight(
  tile: HTMLElement | null,
  visible: boolean,
  video: unknown,
  videoEnabled: boolean
): void {
  const report = use(StageContext)?.reportStreamHeight;
  useEffect(() => {
    if (report === undefined || tile === null || !visible) return undefined;
    const update = (): void => report(tile.querySelector('video')?.videoHeight || null);
    // Neither event bubbles, so they are caught on their way down to the video.
    tile.addEventListener('resize', update, true);
    tile.addEventListener('loadedmetadata', update, true);
    update();
    return (): void => {
      tile.removeEventListener('resize', update, true);
      tile.removeEventListener('loadedmetadata', update, true);
      report(null);
    };
  }, [report, tile, visible, video, videoEnabled]);
}

function SpotlightScreenShareItem({
  vm,
  ref: refProp,
  ...props
}: SpotlightMemberMediaItemBaseProps & { vm: ScreenShareViewModel }): ReactNode {
  const videoEnabled = useBehavior(vm.local ? alwaysEnabled : vm.videoEnabled$);
  const [tile, setTile] = useState<HTMLDivElement | null>(null);
  const ref = useMergedRefs(refProp, setTile);
  useReportStreamHeight(tile, props['aria-hidden'] !== true, props.video, videoEnabled);
  return (
    <MediaView
      ref={ref}
      videoFit="contain"
      mirror={false}
      videoEnabled={videoEnabled}
      data-pinniped-live
      nameTagLeadingIcon={
        <Icon className={mediaCss.leadingIcon} size="Inherit" src={Icons.ScreenShare} aria-hidden />
      }
      {...props}
    />
  );
}

function SpotlightMemberMediaItem({
  vm,
  ...props
}: SpotlightItemBaseProps & { vm: MemberMediaViewModel }): ReactNode {
  const video = useBehavior(vm.video$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const baseProps = { video, unencryptedWarning, ...props };

  if (vm.type === 'user') return <SpotlightUserMediaItem vm={vm} {...baseProps} />;
  return <SpotlightScreenShareItem vm={vm} {...baseProps} />;
}

function SpotlightRingingMediaItem({
  vm,
  ...props
}: SpotlightItemBaseProps & { vm: RingingMediaViewModel }): ReactNode {
  const pickupState = useBehavior(vm.pickupState$);
  const videoEnabled = useBehavior(vm.videoEnabled$);

  return (
    <MediaView
      video={undefined}
      unencryptedWarning={false}
      status={
        pickupState === 'ringing'
          ? { text: 'Calling…', icon: videoEnabled ? Icons.VideoCamera : Icons.Phone }
          : { text: 'Call ended', icon: Icons.PhoneDown }
      }
      videoEnabled={false}
      videoFit="cover"
      mirror={false}
      {...props}
    />
  );
}

interface SpotlightItemProps {
  vm: MediaViewModel;
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  showNameTags: boolean;
  focusable: boolean;
  intersectionObserver$: Behavior<IntersectionObserver | null>;
  /**
   * Whether this item should act as a scroll snapping point.
   */
  snap: boolean;
  'aria-hidden'?: boolean;
}

function SpotlightItem({
  vm,
  targetWidth,
  targetHeight,
  showNameTags,
  focusable,
  intersectionObserver$,
  snap,
  'aria-hidden': ariaHidden,
}: SpotlightItemProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const displayName = useBehavior(vm.displayName$);
  const mxcAvatarUrl = useBehavior(vm.mxcAvatarUrl$);

  // Hook this item up to the intersection observer
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    let prevIo: IntersectionObserver | null = null;
    const subscription = intersectionObserver$.subscribe((io) => {
      prevIo?.unobserve(element);
      io?.observe(element);
      prevIo = io;
    });
    return (): void => {
      subscription.unsubscribe();
      prevIo?.unobserve(element);
    };
  }, [intersectionObserver$]);

  const baseProps: SpotlightItemBaseProps = {
    ref,
    'data-id': vm.id,
    className: classNames(css.item, { [css.snap]: snap }),
    targetWidth,
    targetHeight,
    userId: vm.userId,
    displayName,
    mxcAvatarUrl,
    showNameTags,
    focusable,
    'aria-hidden': ariaHidden,
  };

  return vm.type === 'ringing' ? (
    <SpotlightRingingMediaItem vm={vm} {...baseProps} />
  ) : (
    <SpotlightMemberMediaItem vm={vm} {...baseProps} />
  );
}

/** The stream's own volume: a speaker button (click to mute) raising a slider while hovered. */
function ScreenShareVolumeButton({ vm }: { vm: RemoteScreenShareViewModel }): ReactNode {
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const playbackMuted = useBehavior(vm.playbackMuted$);
  const playbackVolume = useBehavior(vm.playbackVolume$);

  if (!audioEnabled) return null;
  const commit = (): void => vm.commitPlaybackVolume();
  return (
    <div className={css.volumeControl}>
      <div className={css.volumePopup}>
        {/* The slider inside is the control; this only notices when a drag or key press ends. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div className={css.volumeSliderBox} onPointerUp={commit} onKeyUp={commit}>
          <VolumeSlider
            className={css.volumeSlider}
            aria-label="Stream volume"
            value={playbackMuted ? 0 : playbackVolume}
            onChange={(volume) => vm.adjustPlaybackVolume(volume)}
          />
        </div>
      </div>
      <button
        type="button"
        className={css.volumeButton}
        aria-label={playbackMuted ? 'Unmute stream' : 'Mute stream'}
        onClick={() => vm.togglePlaybackMuted()}
      >
        <Icon size="300" src={playbackMuted ? Icons.VolumeMute : Icons.VolumeHigh} aria-hidden />
      </button>
    </div>
  );
}

interface Props {
  ref?: Ref<HTMLDivElement>;
  vm: SpotlightTileViewModel;
  expanded: boolean;
  targetWidth: number;
  targetHeight: number;
  showIndicators: boolean;
  showNameTags: boolean;
  focusable: boolean;
  className?: string;
  style?: MediaViewProps['style'];
  /** Clicking the focused tile goes back to the grid. */
  onClick?: MouseEventHandler<HTMLDivElement>;
  'aria-hidden'?: boolean;
}

/** The media in the spotlight; with several (screen shares), one at a time with arrows between. */
export function SpotlightTile({
  ref: theirRef,
  vm,
  expanded,
  targetWidth,
  targetHeight,
  showIndicators,
  showNameTags,
  focusable,
  className,
  style,
  onClick,
  'aria-hidden': ariaHidden,
}: Props): ReactNode {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const ref = useMergedRefs(setRoot, theirRef);
  const maximised = useBehavior(vm.maximised$);
  const media = useBehavior(vm.media$);
  const [visibleId, setVisibleId] = useState<string | undefined>(media[0]?.id);
  const latestMedia = useLatest(media);
  const latestVisibleId = useLatest(visibleId);
  const visibleIndex = media.findIndex((m) => m.id === visibleId);
  const visibleMedia = media.at(visibleIndex);
  const canGoBack = visibleIndex > 0;
  const canGoToNext = visibleIndex !== -1 && visibleIndex < media.length - 1;

  // To keep track of which item is visible, the items are watched by an intersection observer
  // on the root element. The items run their effects before their parent does, so they take
  // the observer from a Behavior that gets it once the root is there.
  const intersectionObserver$ = useInitial(
    () => new BehaviorSubject<IntersectionObserver | null>(null)
  );
  useEffect(() => {
    if (root === null) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible !== undefined) setVisibleId(visible.target.getAttribute('data-id')!);
      },
      { root, threshold: 0.5 }
    );
    intersectionObserver$.next(io);
    return () => {
      intersectionObserver$.next(null);
      io.disconnect();
    };
  }, [root, intersectionObserver$]);

  const [scrollToId, setScrollToId] = useReactiveState<string | null>(
    (prev) =>
      prev == null || prev === visibleId || media.every((m) => m.id !== prev) ? null : prev,
    [visibleId]
  );

  const onBackClick = useCallback(() => {
    const current = latestMedia.current;
    const index = current.findIndex((m) => m.id === latestVisibleId.current);
    if (index > 0) setScrollToId(current[index - 1].id);
  }, [latestVisibleId, latestMedia, setScrollToId]);

  const onNextClick = useCallback(() => {
    const current = latestMedia.current;
    const index = current.findIndex((m) => m.id === latestVisibleId.current);
    if (index !== -1 && index !== current.length - 1) setScrollToId(current[index + 1].id);
  }, [latestVisibleId, latestMedia, setScrollToId]);

  return (
    <animated.div
      ref={ref}
      className={classNames(className, css.tile, { [css.maximised]: maximised })}
      style={style}
      onClick={onClick}
      aria-hidden={ariaHidden}
    >
      {canGoBack && (
        <button
          type="button"
          className={classNames(css.advance, css.back)}
          aria-label="Back"
          onClick={onBackClick}
          tabIndex={focusable ? undefined : -1}
        >
          <Icon size="400" src={Icons.ChevronLeft} aria-hidden />
        </button>
      )}
      <div className={css.contents}>
        {media.map((m) => (
          <SpotlightItem
            key={m.id}
            vm={m}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showNameTags={showNameTags}
            focusable={focusable}
            intersectionObserver$={intersectionObserver$}
            // This is how the container scrolls to the right media when the previous/next
            // buttons are clicked: every scroll snap point but the wanted one is removed for
            // a moment.
            snap={scrollToId === null || scrollToId === m.id}
            aria-hidden={(scrollToId ?? visibleId) !== m.id}
          />
        ))}
      </div>

      <div className={css.bottomRightButtons}>
        {visibleMedia?.type === 'screen share' && !visibleMedia.local && (
          <ScreenShareVolumeButton vm={visibleMedia} />
        )}
      </div>

      {canGoToNext && (
        <button
          type="button"
          className={classNames(css.advance, css.next)}
          aria-label="Next"
          onClick={onNextClick}
          tabIndex={focusable ? undefined : -1}
        >
          <Icon size="400" src={Icons.ChevronRight} aria-hidden />
        </button>
      )}
      {!expanded && (
        <div
          className={classNames(css.indicators, {
            [css.showIndicators]: showIndicators && media.length > 1,
          })}
        >
          {media.map((m) => (
            <div
              data-testid="screenshare-indicator"
              key={m.id}
              className={css.indicator}
              data-visible={m.id === visibleId}
            />
          ))}
        </div>
      )}
    </animated.div>
  );
}

/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  use,
  useEffect,
} from 'react';
import classNames from 'classnames';
import { Icon, Icons } from 'folds';

import { type GridTileViewModel } from '../../../../plugins/call/engine/state/TileViewModel';
import { type LocalUserMediaViewModel } from '../../../../plugins/call/engine/state/media/LocalUserMediaViewModel';
import { type RemoteUserMediaViewModel } from '../../../../plugins/call/engine/state/media/RemoteUserMediaViewModel';
import { type UserMediaViewModel } from '../../../../plugins/call/engine/state/media/UserMediaViewModel';
import { type RingingMediaViewModel } from '../../../../plugins/call/engine/state/media/RingingMediaViewModel';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { getMouseEventCords } from '../../../../utils/dom';
import { StageContext } from '../StageContext';
import { MediaView, type MediaViewProps } from './MediaView';
import * as mediaCss from './MediaView.css';
import * as css from './GridTile.css';

type TileStyle = MediaViewProps['style'];

interface TileProps {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  style?: TileStyle;
  targetWidth: number;
  targetHeight: number;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  showNameTags: boolean;
  focusable: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

function RingingMediaTile({
  vm,
  className,
  ...props
}: TileProps & { vm: RingingMediaViewModel }): ReactNode {
  const pickupState = useBehavior(vm.pickupState$);
  const videoEnabled = useBehavior(vm.videoEnabled$);

  return (
    <MediaView
      className={classNames(className, css.tile)}
      video={undefined}
      userId={vm.userId}
      unencryptedWarning={false}
      status={
        pickupState === 'ringing'
          ? { text: 'Calling…', icon: videoEnabled ? Icons.VideoCamera : Icons.Phone }
          : { text: 'Call ended', icon: Icons.PhoneDown }
      }
      videoEnabled={videoEnabled}
      videoFit="cover"
      mirror={false}
      {...props}
    />
  );
}

/** Opens Pinniped's member menu at the tile's menu button. */
function MemberMenuButton({ userId, focusable }: { userId: string; focusable: boolean }) {
  const stage = use(StageContext);
  return (
    <button
      type="button"
      className={mediaCss.button}
      aria-label="Options"
      aria-haspopup="menu"
      tabIndex={focusable ? undefined : -1}
      onClick={(evt) => stage?.openMemberMenu(userId, evt.currentTarget.getBoundingClientRect())}
    >
      <Icon size="300" src={Icons.HorizontalDots} aria-hidden />
    </button>
  );
}

interface UserMediaTileProps extends TileProps {
  vm: UserMediaViewModel;
  showSpeakingIndicators: boolean;
  mirror: boolean;
  waitingForMedia?: boolean;
  primaryButton?: ReactNode;
}

function UserMediaTile({
  vm,
  showSpeakingIndicators,
  waitingForMedia,
  primaryButton,
  className,
  focusable,
  targetWidth,
  targetHeight,
  ...props
}: UserMediaTileProps): ReactNode {
  const stage = use(StageContext);
  const video = useBehavior(vm.video$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const speaking = useBehavior(vm.speaking$);
  const videoFit = useBehavior(vm.videoFit$);
  const handRaised = useBehavior(vm.handRaised$);
  const reaction = useBehavior(vm.reaction$);
  const deafened = useBehavior(vm.deafened$);

  // Whenever bounds change, inform the view model
  useEffect(() => {
    if (targetWidth > 0 && targetHeight > 0) vm.setTargetDimensions(targetWidth, targetHeight);
  }, [targetWidth, targetHeight, vm]);

  let audioIcon = Icons.MicMute;
  let audioLabel = 'Microphone off';
  if (deafened) {
    audioIcon = Icons.HeadphoneMute;
    audioLabel = 'Deafened';
  } else if (audioEnabled) {
    audioIcon = Icons.Mic;
    audioLabel = 'Microphone on';
  }

  const showSpeaking = showSpeakingIndicators && speaking;

  const onContextMenu = (evt: MouseEvent<HTMLDivElement>): void => {
    if (stage === null) return;
    evt.preventDefault();
    stage.openMemberMenu(vm.userId, getMouseEventCords(evt.nativeEvent));
  };

  return (
    <MediaView
      video={video}
      userId={vm.userId}
      unencryptedWarning={unencryptedWarning}
      videoEnabled={videoEnabled}
      videoFit={videoFit}
      className={classNames(className, css.tile, {
        [css.speaking]: showSpeaking,
        [css.handRaised]: !showSpeaking && handRaised,
      })}
      nameTagLeadingIcon={
        <Icon
          className={mediaCss.leadingIcon}
          size="Inherit"
          src={audioIcon}
          aria-label={audioLabel}
          data-muted={deafened || !audioEnabled}
        />
      }
      focusable={focusable}
      primaryButton={primaryButton ?? <MemberMenuButton userId={vm.userId} focusable={focusable} />}
      raisedHandTime={handRaised ?? undefined}
      currentReaction={reaction ?? undefined}
      waitingForMedia={waitingForMedia}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
      onContextMenu={onContextMenu}
      // Styling hooks: the speaking ring and the strip's hover.
      data-pinniped-speaking={speaking}
      data-pinniped-user-id={vm.userId}
      {...props}
    />
  );
}

function LocalUserMediaTile({
  vm,
  focusable,
  ...props
}: TileProps & { vm: LocalUserMediaViewModel; showSpeakingIndicators: boolean }): ReactNode {
  const mirror = useBehavior(vm.mirror$);
  const switchCamera = useBehavior(vm.switchCamera$);

  return (
    <UserMediaTile
      vm={vm}
      mirror={mirror}
      primaryButton={
        switchCamera === null ? undefined : (
          <button
            type="button"
            className={mediaCss.button}
            aria-label="Switch camera"
            onClick={switchCamera}
            tabIndex={focusable ? undefined : -1}
          >
            <Icon size="300" src={Icons.Reload} aria-hidden />
          </button>
        )
      }
      focusable={focusable}
      {...props}
    />
  );
}

function RemoteUserMediaTile({
  vm,
  ...props
}: TileProps & { vm: RemoteUserMediaViewModel; showSpeakingIndicators: boolean }): ReactNode {
  const waitingForMedia = useBehavior(vm.waitingForMedia$);
  return <UserMediaTile vm={vm} waitingForMedia={waitingForMedia} mirror={false} {...props} />;
}

interface GridTileProps {
  ref?: Ref<HTMLDivElement>;
  vm: GridTileViewModel;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: TileStyle;
  /** Clicking a tile focuses that participant. */
  onClick?: MouseEventHandler<HTMLDivElement>;
  showSpeakingIndicators: boolean;
  showNameTags: boolean;
  focusable: boolean;
}

/** A participant (or someone being rung) in the grid or the strip. */
export function GridTile({ vm, showSpeakingIndicators, ...props }: GridTileProps): ReactNode {
  const media = useBehavior(vm.media$);
  const displayName = useBehavior(media.displayName$);
  const mxcAvatarUrl = useBehavior(media.mxcAvatarUrl$);

  if (media.type === 'ringing') {
    return (
      <RingingMediaTile
        vm={media}
        displayName={displayName}
        mxcAvatarUrl={mxcAvatarUrl}
        {...props}
      />
    );
  }
  if (media.local) {
    return (
      <LocalUserMediaTile
        vm={media}
        showSpeakingIndicators={showSpeakingIndicators}
        displayName={displayName}
        mxcAvatarUrl={mxcAvatarUrl}
        {...props}
      />
    );
  }
  return (
    <RemoteUserMediaTile
      vm={media}
      showSpeakingIndicators={showSpeakingIndicators}
      displayName={displayName}
      mxcAvatarUrl={mxcAvatarUrl}
      {...props}
    />
  );
}

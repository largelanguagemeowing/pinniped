/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useState,
} from 'react';
import { animated } from '@react-spring/web';
import classNames from 'classnames';
import { Icon, type IconSrc, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import { type TrackReference } from '@livekit/components-core';

import { type ReactionOption } from '../../../../plugins/call/engine/reactions';
import * as css from './MediaView.css';
import { TileAvatar } from './TileAvatar';
import { VideoTrack } from './VideoTrack';
import { RaisedHandIndicator } from '../reactions/RaisedHandIndicator';
import { ReactionIndicator } from '../reactions/ReactionIndicator';

type AnimatedDivProps = ComponentProps<typeof animated.div>;

export interface MediaViewProps extends Omit<AnimatedDivProps, 'ref' | 'style' | 'className'> {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  style?: AnimatedDivProps['style'];
  targetWidth: number;
  targetHeight: number;
  video: TrackReference | undefined;
  videoFit: 'cover' | 'contain';
  mirror: boolean;
  userId: string;
  videoEnabled: boolean;
  unencryptedWarning: boolean;
  /** Their media arrives but cannot be decrypted, so they are not heard or seen. */
  undecryptable: boolean;
  status?: { text: string; icon: IconSrc };
  showNameTags: boolean;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  focusable: boolean;
  primaryButton?: ReactNode;
  raisedHandTime?: Date;
  currentReaction?: ReactionOption;
  waitingForMedia?: boolean;
}

/** Average colour of the avatar image rendered inside `container`, for tinting voice tiles. */
function useAvatarColor(container: HTMLElement | null): string | undefined {
  const [color, setColor] = useState<string>();
  useEffect(() => {
    if (!container) return undefined;
    const sample = (): void => {
      const img = container.querySelector('img');
      if (!img || !img.complete || img.naturalWidth === 0) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        const n = data.length / 4;
        setColor(`rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`);
      } catch {
        // tainted canvas: keep the default tile colour
      }
    };
    const observer = new MutationObserver(() => {
      container.querySelector('img')?.addEventListener('load', sample, { once: true });
      sample();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    sample();
    return (): void => observer.disconnect();
  }, [container]);
  return color;
}

/** A participant's camera, screen share or avatar, with their name tag and reactions on top. */
export function MediaView({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  video,
  videoFit,
  mirror,
  userId,
  videoEnabled,
  unencryptedWarning,
  undecryptable,
  showNameTags,
  nameTagLeadingIcon,
  displayName,
  mxcAvatarUrl,
  focusable,
  primaryButton,
  status,
  raisedHandTime,
  currentReaction,
  waitingForMedia,
  ...props
}: MediaViewProps) {
  const miniature = Math.min(targetWidth, targetHeight) / 2 < 96;
  const [bgEl, setBgEl] = useState<HTMLDivElement | null>(null);
  const avatarColor = useAvatarColor(bgEl);
  const showVideo = video !== undefined && videoEnabled;

  const warnings = unencryptedWarning && (
    <TooltipProvider
      position="Bottom"
      tooltip={
        <Tooltip>
          <Text size="T200">Not encrypted</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <Icon
          ref={anchorRef}
          className={css.errorIcon}
          size="100"
          src={Icons.Warning}
          filled
          role="img"
          aria-label="Not encrypted"
          tabIndex={focusable ? 0 : -1}
        />
      )}
    </TooltipProvider>
  );

  return (
    <animated.div
      className={classNames(css.media, className, { [css.mirror]: mirror })}
      style={
        avatarColor
          ? ({
              ...style,
              [css.mediaVars.avatarColor]: avatarColor,
            } as CSSProperties as AnimatedDivProps['style'])
          : style
      }
      ref={ref}
      data-testid="videoTile"
      data-video-fit={videoFit}
      data-voice={!showVideo}
      {...props}
    >
      <div className={css.bg} ref={setBgEl}>
        <TileAvatar
          userId={userId}
          name={displayName}
          mxcUrl={mxcAvatarUrl}
          className={classNames(css.avatar, {
            // Over a status, the avatar is translucent so the status reads.
            [css.translucent]: status || undecryptable,
          })}
          style={{ display: showVideo ? 'none' : undefined }}
        />
        {video !== undefined && (
          <VideoTrack
            trackRef={video}
            style={{ display: showVideo ? 'block' : 'none' }}
            data-testid="video"
          />
        )}
      </div>
      <div className={css.fg}>
        <div className={css.reactions}>
          <RaisedHandIndicator raisedHandTime={raisedHandTime} miniature={miniature} />
          {currentReaction && (
            <ReactionIndicator miniature={miniature} emoji={currentReaction.emoji} />
          )}
        </div>
        {undecryptable ? (
          <TooltipProvider
            position="Bottom"
            tooltip={
              <Tooltip style={{ maxWidth: '18rem' }}>
                <Text size="T200">
                  Their audio and video arrive but can&apos;t be decrypted, so you don&apos;t hear
                  or see them. Their encryption key is missing or doesn&apos;t match.
                </Text>
              </Tooltip>
            }
          >
            {(anchorRef) => (
              <div
                ref={anchorRef}
                className={classNames(css.status, css.undecryptable)}
                data-pinniped-undecryptable
              >
                <Icon size="100" src={Icons.Warning} filled aria-hidden />
                <Text as="span" size="T200" truncate>
                  Can&apos;t decrypt
                </Text>
              </div>
            )}
          </TooltipProvider>
        ) : (
          waitingForMedia && <div className={css.status}>Waiting for media...</div>
        )}
        {status && (
          <div className={css.status}>
            <Icon size="100" src={status.icon} aria-hidden />
            <Text as="span" size="T200">
              {status.text}
            </Text>
          </div>
        )}
        {showNameTags && targetWidth >= 100 ? (
          <div className={css.nameTag}>
            {nameTagLeadingIcon}
            <Text as="span" size="T200" className={css.name} data-testid="name_tag">
              {displayName}
            </Text>
            {warnings}
          </div>
        ) : (
          warnings
        )}
        {primaryButton}
      </div>
    </animated.div>
  );
}

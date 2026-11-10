/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { animated } from "@react-spring/web";
import {
  useEffect,
  useState,
  type FC,
  type ComponentProps,
  type ReactNode,
  type ComponentType,
  type SVGAttributes,
} from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { VideoTrack } from "@livekit/components-react";
import { Text, Tooltip } from "@vector-im/compound-web";
import { ErrorSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaView.module.css";
import { Avatar } from "../Avatar";
import { RaisedHandIndicator } from "../reactions/RaisedHandIndicator";
import {
  showConnectionStats as showConnectionStatsSetting,
  showHandRaisedTimer,
  useSetting,
} from "../settings/settings";
import { type ReactionOption } from "../reactions";
import { ReactionIndicator } from "../reactions/ReactionIndicator";
import { RTCConnectionStats } from "../RTCConnectionStats";

interface Props extends ComponentProps<typeof animated.div> {
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder | undefined;
  videoFit: "cover" | "contain";
  mirror: boolean;
  userId: string;
  videoEnabled: boolean;
  unencryptedWarning: boolean;
  status?: { text: string; Icon: ComponentType<SVGAttributes<SVGElement>> };
  showNameTags: boolean;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  focusable: boolean;
  primaryButton?: ReactNode;
  raisedHandTime?: Date;
  currentReaction?: ReactionOption;
  raisedHandOnClick?: () => void;
  waitingForMedia?: boolean;
  audioStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  videoStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  rtcBackendIdentity?: string;
  // The focus url, mainly for debugging purposes
  focusUrl?: string;
}

/** Average colour of the avatar image rendered inside `container`, for tinting voice tiles. */
function useAvatarColor(container: HTMLElement | null): string | undefined {
  const [color, setColor] = useState<string>();
  useEffect(() => {
    if (!container) return undefined;
    const sample = (): void => {
      const img = container.querySelector("img");
      if (!img || !img.complete || img.naturalWidth === 0) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d");
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
        setColor(
          `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`,
        );
      } catch {
        // tainted canvas: keep the default tile colour
      }
    };
    const observer = new MutationObserver(() => {
      container.querySelector("img")?.addEventListener("load", sample, {
        once: true,
      });
      sample();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    sample();
    return (): void => observer.disconnect();
  }, [container]);
  return color;
}

export const MediaView: FC<Props> = ({
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
  showNameTags,
  nameTagLeadingIcon,
  displayName,
  mxcAvatarUrl,
  focusable,
  primaryButton,
  status,
  raisedHandTime,
  currentReaction,
  raisedHandOnClick,
  waitingForMedia,
  audioStreamStats,
  videoStreamStats,
  rtcBackendIdentity,
  focusUrl,
  ...props
}) => {
  const { t } = useTranslation();
  const [handRaiseTimerVisible] = useSetting(showHandRaisedTimer);
  const [showConnectionStats] = useSetting(showConnectionStatsSetting);

  const avatarSize = Math.round(Math.min(targetWidth, targetHeight) / 2);
  const [bgEl, setBgEl] = useState<HTMLDivElement | null>(null);
  const avatarColor = useAvatarColor(bgEl);

  const warnings = unencryptedWarning && (
    <Tooltip
      label={t("common.unencrypted")}
      placement="bottom"
      isTriggerInteractive={false}
      nonInteractiveTriggerTabIndex={focusable ? undefined : -1}
    >
      <ErrorSolidIcon
        width={20}
        height={20}
        className={styles.errorIcon}
        role="img"
        aria-label={t("common.unencrypted")}
      />
    </Tooltip>
  );

  return (
    <animated.div
      className={classNames(styles.media, className, {
        [styles.mirror]: mirror,
      })}
      style={
        avatarColor
          ? ({
              ...style,
              "--pinniped-avatar-color": avatarColor,
            } as typeof style)
          : style
      }
      ref={ref}
      data-testid="videoTile"
      data-video-fit={videoFit}
      data-voice={!(video && videoEnabled)}
      {...props}
    >
      <div className={styles.bg} ref={setBgEl}>
        <Avatar
          id={userId}
          name={displayName}
          size={avatarSize}
          src={mxcAvatarUrl}
          className={classNames(styles.avatar, {
            // When the avatar is overlaid with a status, make it translucent
            // for readability
            [styles.translucent]: status,
          })}
          style={{ display: video && videoEnabled ? "none" : "initial" }}
        />
        {video?.publication !== undefined && (
          <VideoTrack
            trackRef={video}
            // There's no reason for this to be focusable
            tabIndex={-1}
            disablePictureInPicture
            style={{ display: video && videoEnabled ? "block" : "none" }}
            data-testid="video"
          />
        )}
      </div>
      <div className={styles.fg}>
        <div className={styles.reactions}>
          <RaisedHandIndicator
            raisedHandTime={raisedHandTime}
            miniature={avatarSize < 96}
            showTimer={handRaiseTimerVisible}
            onClick={raisedHandOnClick}
            tabIndex={focusable ? undefined : -1}
          />
          {currentReaction && (
            <ReactionIndicator
              miniature={avatarSize < 96}
              emoji={currentReaction.emoji}
            />
          )}
        </div>
        {waitingForMedia && (
          <div className={styles.status}>
            {t("video_tile.waiting_for_media")}
            {showConnectionStats ? " " + rtcBackendIdentity : ""}
          </div>
        )}
        {showConnectionStats && (
          <>
            <RTCConnectionStats
              audio={audioStreamStats}
              video={videoStreamStats}
              focusUrl={focusUrl}
              rtcBackendIdentity={rtcBackendIdentity}
            />
          </>
        )}
        {status && (
          <div className={styles.status}>
            <status.Icon width={16} height={16} aria-hidden />
            <Text as="span" size="sm" weight="medium">
              {status.text}
            </Text>
          </div>
        )}
        {/* TODO: Bring this back once encryption status is less broken */}
        {/*encryptionStatus !== EncryptionStatus.Okay && (
            <div className={styles.status}>
              <Text as="span" size="sm" weight="medium" className={styles.name}>
                {encryptionStatus === EncryptionStatus.Connecting &&
                  t("e2ee_encryption_status.connecting")}
                {encryptionStatus === EncryptionStatus.KeyMissing &&
                  t("e2ee_encryption_status.key_missing")}
                {encryptionStatus === EncryptionStatus.KeyInvalid &&
                  t("e2ee_encryption_status.key_invalid")}
                {encryptionStatus === EncryptionStatus.PasswordInvalid &&
                  t("e2ee_encryption_status.password_invalid")}
              </Text>
            </div>
          )*/}
        {showNameTags && targetWidth >= 100 ? (
          <div className={styles.nameTag}>
            {nameTagLeadingIcon}
            <Text
              as="span"
              size="sm"
              weight="medium"
              className={styles.name}
              data-testid="name_tag"
            >
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
};

MediaView.displayName = "MediaView";

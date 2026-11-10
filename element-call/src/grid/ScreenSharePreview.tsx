/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, use } from "react";
import classNames from "classnames";
import { VideoTrack } from "@livekit/components-react";
import { ShareScreenSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./ScreenSharePreview.module.css";
import { useBehavior } from "../useBehavior";
import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { FocusMediaContext } from "./FocusMedia";

interface Props {
  vm: ScreenShareViewModel;
  /**
   * "strip": a small dimmed preview in the spotlight layout's participant strip.
   * "grid": a full live tile in the grid layout, sized by the grid.
   */
  variant?: "strip" | "grid";
}

/**
 * Pinniped: preview of a screen share in the participant strip,
 * shown next to the participants while the share is in the spotlight.
 */
export const ScreenSharePreview: FC<Props> = ({ vm, variant = "strip" }) => {
  const video = useBehavior(vm.video$);
  const displayName = useBehavior(vm.displayName$);
  const focus = use(FocusMediaContext);

  return (
    <button
      type="button"
      className={classNames(styles.preview, {
        [styles.gridTile]: variant === "grid",
      })}
      data-testid="screenSharePreview"
      aria-label={`Focus ${displayName}'s screen`}
      onClick={() => focus?.focusMedia(vm.id)}
    >
      {video?.publication !== undefined && (
        <VideoTrack
          trackRef={video}
          tabIndex={-1}
          disablePictureInPicture
          className={styles.video}
        />
      )}
      <ShareScreenSolidIcon
        className={styles.icon}
        aria-hidden
        width={40}
        height={40}
      />
      <span className={styles.live}>Live</span>
      <span className={styles.name}>
        <ShareScreenSolidIcon aria-hidden width={16} height={16} />
        {displayName}
      </span>
    </button>
  );
};

import React, { type CSSProperties } from 'react';
import classNames from 'classnames';

import { UserAvatar } from '../../../../components/user-avatar';
import { useMatrixClient } from '../../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../../../utils/matrix';
import { nameInitials } from '../../../../utils/common';
import * as css from './TileAvatar.css';

/** Avatars are shown at most 80px wide (voice tiles); fetched for 2x screens. */
const THUMBNAIL_SIZE = 160;

type TileAvatarProps = {
  userId: string;
  name: string;
  mxcUrl: string | undefined;
  className?: string;
  style?: CSSProperties;
};

/** A participant's round avatar, or their initial on their colour. */
export function TileAvatar({ userId, name, mxcUrl, className, style }: TileAvatarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const src = mxcUrl
    ? (mxcUrlToHttp(mx, mxcUrl, useAuthentication, THUMBNAIL_SIZE, THUMBNAIL_SIZE, 'crop') ??
      undefined)
    : undefined;

  return (
    <span className={classNames(css.avatar, className)} style={style}>
      <UserAvatar
        userId={userId}
        src={src}
        alt={name}
        renderFallback={() => <span className={css.initials}>{nameInitials(name)}</span>}
      />
    </span>
  );
}

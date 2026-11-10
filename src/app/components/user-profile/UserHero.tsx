import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '../../../util/colorMXID';
import { getMxIdLocalPart, getMxIdServer } from '../../utils/matrix';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import { UserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '../../utils/keyboard';
import { MatrixOrgBadge } from '../server-badge';
import { isMatrixOrgAdministered } from '../../plugins/matrix-org-servers';

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  profileLoaded: boolean;
  presence?: UserPresence;
};
export function UserHero({ userId, avatarUrl, bannerUrl, profileLoaded, presence }: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  const coverUrl = bannerUrl ?? (profileLoaded ? avatarUrl : undefined);

  return (
    <Box direction="Column" className={css.UserHero}>
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
          filter: coverUrl ? undefined : 'brightness(50%)',
        }}
      >
        {coverUrl && (
          <img
            className={bannerUrl ? css.UserHeroBanner : css.UserHeroCover}
            src={coverUrl}
            alt=""
            draggable="false"
          />
        )}
      </div>
      <div className={css.UserHeroAvatarContainer}>
        <AvatarPresence
          className={css.UserAvatarContainer}
          badge={
            presence && <PresenceBadge presence={presence.presence} status={presence.status} />
          }
        >
          <Avatar
            as={avatarUrl ? 'button' : 'div'}
            onClick={avatarUrl ? () => setViewAvatar(avatarUrl) : undefined}
            className={css.UserHeroAvatar}
            size="500"
          >
            <UserAvatar
              className={css.UserHeroAvatarImg}
              userId={userId}
              src={avatarUrl}
              alt={userId}
              renderFallback={() => <Icon size="500" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarPresence>
        {viewAvatar && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewAvatar(undefined),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal size="500" onContextMenu={(evt) => evt.stopPropagation()}>
                  <ImageViewer
                    src={viewAvatar}
                    alt={userId}
                    requestClose={() => setViewAvatar(undefined)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
      </div>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
  pronouns?: string;
};
export function UserHeroName({ displayName, userId, pronouns }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const server = getMxIdServer(userId);

  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text
          size="H4"
          className={classNames(BreakWord, LineClamp3)}
          title={displayName ?? username}
        >
          {displayName ?? username ?? userId}
        </Text>
        {pronouns && (
          <Text size="T200" priority="300">
            {pronouns}
          </Text>
        )}
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text size="T200" className={classNames(BreakWord, LineClamp3)} title={userId}>
          @{username}
          {server && (
            <Text as="span" size="Inherit" priority="300">
              :{server}
            </Text>
          )}
        </Text>
        {server && isMatrixOrgAdministered(server) && <MatrixOrgBadge server={server} />}
      </Box>
    </Box>
  );
}

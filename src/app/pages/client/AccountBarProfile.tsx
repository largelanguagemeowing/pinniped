import React, { MouseEventHandler, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { useAtom } from 'jotai';
import {
  Avatar,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import { UserAvatar } from '../../components/user-avatar';
import { Modal500 } from '../../components/Modal500';
import { PresenceStatus } from '../../components/presence/PresenceStatus';
import { UserHero, UserHeroName } from '../../components/user-profile/UserHero';
import { UserBiography } from '../../components/user-profile/UserBiography';
import { UserRichPresence } from '../../components/user-profile/UserRichPresence';
import { Settings, SettingsPages } from '../../features/settings';
import { settingsModalAtom } from '../../state/settingsModal';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { Presence, useUserPresence } from '../../hooks/useUserPresence';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useUserRichPresence } from '../../hooks/useUserRichPresence';
import { nameInitials } from '../../utils/common';
import { sendPresence, useOwnStatus } from '../../state/statusMessage';
import { copyToClipboard } from '../../utils/dom';
import { stopPropagation } from '../../utils/keyboard';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import {
  getProfileBanner,
  getProfileBiography,
  getProfilePronouns,
} from '../../../types/matrix/profile';
import * as css from './AccountBar.css';

const PRESENCE_OPTIONS: { presence: Presence; label: string; dot: string }[] = [
  { presence: Presence.Online, label: 'Online', dot: '#50FA7B' },
  { presence: Presence.Unavailable, label: 'Away', dot: '#F1C40F' },
  { presence: Presence.Offline, label: 'Invisible', dot: '#80848E' },
];

type AccountMenuProps = {
  requestClose: () => void;
  openSettings: (page?: SettingsPages) => void;
};
function AccountMenu({ requestClose, openSettings }: AccountMenuProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const presence = useUserPresence(userId);
  const richPresence = useUserRichPresence(userId);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication) ?? undefined)
    : undefined;
  const bannerMxc = getProfileBanner(profile.extended);
  const bannerUrl = bannerMxc
    ? (mxcUrlToHttp(mx, bannerMxc, useAuthentication) ?? undefined)
    : undefined;
  const biography = getProfileBiography(profile.extended);
  const pronouns = getProfilePronouns(profile.extended)
    .map((pronoun) => pronoun.summary)
    .join(', ');
  const status = useOwnStatus(userId);

  const setPresence = (next: Presence) => {
    sendPresence(mx, next).catch(() => undefined);
    requestClose();
  };

  return (
    <Menu style={{ width: toRem(320) }}>
      <Box direction="Column">
        <UserHero
          userId={userId}
          avatarUrl={avatarUrl}
          bannerUrl={bannerUrl}
          profileLoaded={profile.loaded}
          presence={presence && presence.lastActiveTs !== 0 ? presence : undefined}
        />
        <Box direction="Column" gap="300" style={{ padding: config.space.S400 }}>
          <UserHeroName displayName={displayName} userId={userId} pronouns={pronouns} />
          {(status || richPresence) && (
            <PresenceStatus status={status || undefined} richPresence={richPresence} />
          )}
          {biography && <UserBiography biography={biography} />}
          {richPresence && <UserRichPresence presence={richPresence} />}
        </Box>
      </Box>
      <Box gap="100" style={{ padding: `${config.space.S200} ${config.space.S200} 0` }}>
        {PRESENCE_OPTIONS.map(({ presence: option, label, dot }) => {
          const selected = presence?.presence === option;
          return (
            <Button
              key={option}
              size="300"
              radii="300"
              variant={selected ? 'Primary' : 'Secondary'}
              fill={selected ? 'Soft' : 'None'}
              aria-pressed={selected}
              style={{ flexGrow: 1, minWidth: 0 }}
              before={
                <span
                  style={{
                    width: toRem(8),
                    height: toRem(8),
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: dot,
                  }}
                />
              }
              onClick={() => setPresence(option)}
            >
              <Text size="B300" truncate>
                {label}
              </Text>
            </Button>
          );
        })}
      </Box>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          size="300"
          radii="300"
          before={<Icon size="100" src={Icons.Pencil} />}
          onClick={() => openSettings(SettingsPages.AccountPage)}
        >
          <Text size="B400">Edit Profile</Text>
        </MenuItem>
        <MenuItem
          size="300"
          radii="300"
          before={<Icon size="100" src={Icons.User} />}
          onClick={() => {
            copyToClipboard(userId);
            requestClose();
          }}
        >
          <Text size="B400">Copy User ID</Text>
        </MenuItem>
      </Box>
    </Menu>
  );
}

export function AccountBarProfile() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const richPresence = useUserRichPresence(userId);
  const [settings, setSettings] = useAtom(settingsModalAtom);
  const [menuCords, setMenuCords] = useState<RectCords>();

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const status = useOwnStatus(userId);
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 64, 64, 'crop') ?? undefined)
    : undefined;

  const openSettings = (page?: SettingsPages) => {
    setMenuCords(undefined);
    setSettings({ page });
  };
  const closeSettings = () => setSettings(undefined);
  const closedAtRef = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => {
    closedAtRef.current = Date.now();
    setMenuCords(undefined);
  };

  // Close on any press outside the menu, independent of the focus trap.
  useEffect(() => {
    if (!menuCords) return undefined;
    const handlePress = (evt: PointerEvent) => {
      const target = evt.target as Node | null;
      if (
        target &&
        (menuRef.current?.contains(target) || profileButtonRef.current?.contains(target))
      ) {
        return;
      }
      closeMenu();
    };
    document.addEventListener('pointerdown', handlePress, true);
    return () => document.removeEventListener('pointerdown', handlePress, true);
    // closeMenu only touches refs and a state setter
  }, [menuCords]);

  const handleOpenMenu: MouseEventHandler<HTMLElement> = (evt) => {
    // The focus trap closes the menu on the same press that lands here, so a
    // click on the trigger while open would otherwise reopen it straight away.
    if (menuCords) {
      closeMenu();
      return;
    }
    if (Date.now() - closedAtRef.current < 300) return;
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <Box className={css.Profile} alignItems="Center" gap="200" shrink="Yes">
        <PopOut
          anchor={menuCords}
          position="Bottom"
          align="Start"
          offset={4}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: closeMenu,
                clickOutsideDeactivates: true,
                returnFocusOnDeactivate: false,
                escapeDeactivates: stopPropagation,
              }}
            >
              <div ref={menuRef}>
                <AccountMenu requestClose={closeMenu} openSettings={openSettings} />
              </div>
            </FocusTrap>
          }
        >
          <Box
            as="button"
            type="button"
            ref={profileButtonRef}
            className={css.ProfileButton}
            alignItems="Center"
            gap="200"
            grow="Yes"
            aria-haspopup="menu"
            aria-expanded={!!menuCords}
            onClick={handleOpenMenu}
          >
            <Box shrink="No">
              <Avatar className={css.ProfileAvatar} size="300" radii="300">
                <UserAvatar
                  userId={userId}
                  src={avatarUrl}
                  alt={displayName}
                  renderFallback={() => <Text size="H5">{nameInitials(displayName)}</Text>}
                />
              </Avatar>
            </Box>
            <Box className={css.ProfileText} direction="Column" gap="0">
              <Text size="L400" truncate>
                {displayName}
              </Text>
              {(status || richPresence) && (
                <PresenceStatus status={status || undefined} richPresence={richPresence} />
              )}
            </Box>
          </Box>
        </PopOut>
        <TooltipProvider
          position="Bottom"
          offset={4}
          tooltip={
            <Tooltip>
              <Text size="H5">User Settings</Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <IconButton
              ref={triggerRef}
              variant="Background"
              fill="None"
              size="300"
              onClick={() => openSettings()}
              aria-label="User Settings"
              aria-pressed={!!settings}
            >
              <Icon size="200" src={Icons.Setting} filled={!!settings} />
            </IconButton>
          )}
        </TooltipProvider>
      </Box>
      {settings && (
        <Modal500 requestClose={closeSettings}>
          <Settings initialPage={settings.page} requestClose={closeSettings} />
        </Modal500>
      )}
    </>
  );
}

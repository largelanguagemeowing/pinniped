import React, { MouseEventHandler, ReactNode, forwardRef, useState } from 'react';
import { Room } from 'matrix-js-sdk';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Text,
  Menu,
  MenuItem,
  color,
  config,
  PopOut,
  toRem,
  Line,
  RectCords,
  Badge,
  Spinner,
  IconSrc,
} from 'folds';
import { useFocusWithin, useHover } from 'react-aria';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue } from 'jotai';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { NavItem, NavItemContent, NavItemOptions, NavLink } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import {
  getDirectRoomAvatarUrl,
  getMemberAvatarMxc,
  getMemberDisplayName,
  getRoomAvatarUrl,
  getStateEvent,
} from '../../utils/room';
import { nameInitials } from '../../utils/common';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { getPowersLevelFromMatrixEvent, usePowerLevels } from '../../hooks/usePowerLevels';
import { copyToClipboard, getMouseEventCords } from '../../utils/dom';
import { markAsRead } from '../../utils/notifications';
import { mDirectAtom } from '../../state/mDirectList';
import { UseStateProvider } from '../../components/UseStateProvider';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';
import { TypingIndicator } from '../../components/typing-indicator';
import { stopPropagation } from '../../utils/keyboard';
import { CallMemberMenu } from '../call/CallMemberMenu';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import {
  addRoomIdToMDirect,
  getCanonicalAliasOrRoomId,
  guessDmRoomUserId,
  getMxIdLocalPart,
  isRoomAlias,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { getViaServers } from '../../plugins/via-servers';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../components/user-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
} from '../../hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import { getRoomCreatorsForRoomId, useRoomCreators } from '../../hooks/useRoomCreators';
import { getRoomPermissionsAPI, useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { useUserPresence } from '../../hooks/useUserPresence';
import { useUserRichPresence } from '../../hooks/useUserRichPresence';
import { AvatarPresence, PresenceBadge } from '../../components/presence';
import { PresenceStatus } from '../../components/presence/PresenceStatus';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useStateEvent } from '../../hooks/useStateEvent';
import { UnencryptedIcon } from '../../components/unencrypted-indicator';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { useCallParticipantActivity } from '../../hooks/useCallSpeakers';
import { callChatAtom } from '../../state/callEmbed';
import { useCallPreferencesAtom } from '../../state/hooks/callPreferences';
import { useAutoDiscoveryInfo } from '../../hooks/useAutoDiscoveryInfo';
import { livekitSupport } from '../../hooks/useLivekitSupport';
import { StateEvent } from '../../../types/matrix/room';
import { webRTCSupported } from '../../utils/rtc';
import * as css from './styles.css';

const VOICE_CHANNEL_PREFIX_RE = /^\[🔊\ufe0f?\]\s*/;

type RoomNavItemMenuProps = {
  room: Room;
  requestClose: () => void;
  notificationMode?: RoomNotificationMode;
};
const RoomNavItemMenu = forwardRef<HTMLDivElement, RoomNavItemMenuProps>(
  ({ room, requestClose, notificationMode }, ref) => {
    const mx = useMatrixClient();
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openRoomSettings = useOpenRoomSettings();
    const space = useSpaceOptionally();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, hideActivity);
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleRoomSettings = () => {
      openRoomSettings(room.roomId, space?.roomId);
      requestClose();
    };

    const mDirects = useAtomValue(mDirectAtom);
    const handleMarkAsDirect = () => {
      addRoomIdToMDirect(mx, room.roomId, guessDmRoomUserId(room, mx.getSafeUserId()));
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleMarkAsRead}
            size="300"
            after={<Icon size="100" src={Icons.CheckTwice} />}
            radii="300"
            disabled={!unread}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MenuItem>
          <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
            {(handleOpen, opened, changing) => (
              <MenuItem
                size="300"
                after={
                  changing ? (
                    <Spinner size="100" variant="Secondary" />
                  ) : (
                    <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                  )
                }
                radii="300"
                aria-pressed={opened}
                onClick={handleOpen}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Notifications
                </Text>
              </MenuItem>
            )}
          </RoomNotificationModeSwitcher>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleInvite}
            variant="Primary"
            fill="None"
            size="300"
            after={<Icon size="100" src={Icons.UserPlus} />}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleCopyLink}
            size="300"
            after={<Icon size="100" src={Icons.Link} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Link
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleRoomSettings}
            size="300"
            after={<Icon size="100" src={Icons.Setting} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MenuItem>
          {!mDirects.has(room.roomId) && (
            <MenuItem
              onClick={handleMarkAsDirect}
              size="300"
              after={<Icon size="100" src={Icons.User} />}
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Mark as Direct
              </Text>
            </MenuItem>
          )}
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptLeave, setPromptLeave) => (
              <>
                <MenuItem
                  onClick={() => setPromptLeave(true)}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                  radii="300"
                  aria-pressed={promptLeave}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave Room
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveRoomPrompt
                    roomId={room.roomId}
                    onDone={requestClose}
                    onCancel={() => setPromptLeave(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
        </Box>
      </Menu>
    );
  }
);

function CallChatToggle() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <IconButton
      onClick={() => setChat(!chat)}
      aria-pressed={chat}
      aria-label="Toggle Chat"
      variant="Background"
      fill="None"
      size="300"
      radii="300"
    >
      <Icon size="50" src={Icons.Message} filled={chat} />
    </IconButton>
  );
}

/** State icons after a voice channel member's name. */
function CallMemberStateIcon({ src, label }: { src: IconSrc; label: string }) {
  return (
    <Box shrink="No" title={label} aria-label={label} style={{ opacity: config.opacity.P300 }}>
      <Icon size="50" src={src} />
    </Box>
  );
}

type CallNavItemMembersProps = {
  room: Room;
  members: CallMembership[];
};
function CallNavItemMembers({ room, members }: CallNavItemMembersProps) {
  const [menu, setMenu] = useState<{ userId: string; cords: RectCords }>();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();
  const callEmbed = useCallEmbed();
  const roomCallEmbed = callEmbed?.roomId === room.roomId ? callEmbed : undefined;
  const { speakers, screenSharers, muted, deafened } = useCallParticipantActivity(roomCallEmbed);
  const myUserId = mx.getSafeUserId();

  return (
    <Box
      className={css.CallNavItemMembers}
      direction="Column"
      gap="100"
      style={{ padding: `${config.space.S100} 0 ${config.space.S100} ${config.space.S500}` }}
    >
      {members.map((callMember) => {
        const userId = callMember.sender;
        if (!userId) return null;
        const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = getMemberAvatarMxc(room, userId);
        const avatarUrl = avatarMxc
          ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96) ?? undefined)
          : undefined;

        return (
          <Box
            key={callMember.memberId}
            as="button"
            className={css.CallNavItemMember}
            aria-label={[
              name,
              speakers.has(userId) && 'speaking',
              screenSharers.has(userId) && 'sharing screen',
              muted.has(userId) && 'muted',
            ]
              .filter(Boolean)
              .join(', ')}
            data-speaking={speakers.has(userId)}
            aria-haspopup="menu"
            onContextMenu={(evt: React.MouseEvent<HTMLButtonElement>) => {
              evt.preventDefault();
              setMenu({ userId, cords: getMouseEventCords(evt.nativeEvent) });
            }}
            alignItems="Center"
            gap="200"
            shrink="No"
            onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
              openUserProfile(
                room.roomId,
                undefined,
                userId,
                getMouseEventCords(evt.nativeEvent),
                'Right'
              )
            }
          >
            <Avatar className={css.CallNavItemMemberAvatar} size="200" radii="400">
              <UserAvatar
                userId={userId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => <Icon size="50" src={Icons.User} filled />}
              />
            </Avatar>
            <Text size="T300" priority={speakers.has(userId) ? '500' : '300'} truncate>
              {name}
            </Text>
            <Box shrink="No" alignItems="Center" gap="100" style={{ marginLeft: 'auto' }}>
              {muted.has(userId) && <CallMemberStateIcon src={Icons.MicMute} label="Muted" />}
              {deafened.has(userId) && (
                <CallMemberStateIcon src={Icons.HeadphoneMute} label="Deafened" />
              )}
              {screenSharers.has(userId) && (
                <Box shrink="No" title="Sharing screen">
                  <Badge size="300" variant="Critical" fill="Solid" radii="300">
                    <Text size="L400">LIVE</Text>
                  </Badge>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
      <PopOut
        anchor={menu?.cords}
        offset={0}
        alignOffset={0}
        position="Bottom"
        align="Start"
        content={
          menu && (
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenu(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <CallMemberMenu
                roomId={room.roomId}
                userId={menu.userId}
                cords={menu.cords}
                control={menu.userId === myUserId ? roomCallEmbed?.control : undefined}
                requestClose={() => setMenu(undefined)}
              />
            </FocusTrap>
          )
        }
      />
    </Box>
  );
}

type RoomNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
  notificationMode?: RoomNotificationMode;
  showAvatar?: boolean;
  direct?: boolean;
};
export function RoomNavItem({
  room,
  selected,
  showAvatar,
  direct,
  notificationMode,
  linkPath,
}: RoomNavItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const typingMember = useRoomTypingMember(room.roomId).filter(
    (receipt) => receipt.userId !== mx.getUserId()
  );

  const roomName = useRoomName(room);
  const encrypted = !!useStateEvent(room, StateEvent.RoomEncryption);
  const unencryptedDm = !!direct && !encrypted;

  const [showPresenceInDMList] = useSetting(settingsAtom, 'showPresenceInDMList');
  const dmPartnerId = direct && showAvatar ? room.getAvatarFallbackMember()?.userId : undefined;
  const presenceUserId = dmPartnerId && dmPartnerId !== mx.getUserId() ? dmPartnerId : '';
  const presence = useUserPresence(presenceUserId);
  const hasPresence =
    showPresenceInDMList && direct && showAvatar && presence && presence.lastActiveTs !== 0;
  const presenceBadge = hasPresence ? (
    <PresenceBadge presence={presence.presence} status={presence.status} size="200" />
  ) : undefined;
  const statusMsg = hasPresence && presence.status ? presence.status : undefined;
  // Rich presence surfaces in the status slot even without m.presence data;
  // the hook is a no-op for the empty userId used by non-DM rooms.
  const richPresence = useUserRichPresence(showPresenceInDMList && direct ? presenceUserId : '');

  const voiceMatch = roomName.match(VOICE_CHANNEL_PREFIX_RE);
  const isVoiceChannel = !!voiceMatch;
  const displayName = isVoiceChannel ? roomName.slice(voiceMatch[0].length) : roomName;

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const optionsVisible = hover || !!menuAnchor;
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const callPref = useAtomValue(useCallPreferencesAtom());
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  const handleStartCall: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    const powerLevelsEvent = getStateEvent(room, StateEvent.RoomPowerLevels);
    const powerLevels = getPowersLevelFromMatrixEvent(powerLevelsEvent);
    const creators = getRoomCreatorsForRoomId(mx, room.roomId);
    const permissions = getRoomPermissionsAPI(creators, powerLevels);

    const hasCallPermission = permissions.stateEvent(
      StateEvent.GroupCallMemberPrefix,
      mx.getSafeUserId()
    );

    // Do not join if missing permissions or no livekit support or no webRTC support
    if (!hasCallPermission || !livekitSupport(autoDiscoveryInfo) || !webRTCSupported()) {
      return;
    }

    // Do not join if already in call
    if (callEmbed) {
      return;
    }
    // Start call in second click
    if (selected) {
      evt.preventDefault();
      startCall(room, callPref);
    }
  };

  const iconOpacity = unread ? config.opacity.P500 : config.opacity.P300;
  let avatarContent: ReactNode;
  if (isVoiceChannel) {
    avatarContent = (
      <Icon
        style={callMembers.length > 0 ? { color: color.Success.Main } : { opacity: iconOpacity }}
        size="100"
        src={Icons.VolumeHigh}
        filled={callMembers.length > 0}
      />
    );
  } else if (showAvatar) {
    avatarContent = (
      <RoomAvatar
        roomId={room.roomId}
        src={
          direct
            ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
            : getRoomAvatarUrl(mx, room, 96, useAuthentication)
        }
        alt={displayName}
        renderFallback={() => (
          <Text as="span" size="H6">
            {nameInitials(displayName)}
          </Text>
        )}
      />
    );
  } else {
    avatarContent = (
      <RoomIcon
        style={{ opacity: iconOpacity }}
        filled={selected}
        size="100"
        joinRule={room.getJoinRule()}
        roomType={room.getType()}
      />
    );
  }

  return (
    <Box direction="Column">
      <NavItem
        variant="Background"
        radii="400"
        highlight={unread !== undefined}
        aria-selected={selected}
        data-hover={!!menuAnchor}
        onContextMenu={handleContextMenu}
        {...hoverProps}
        {...focusWithinProps}
      >
        <NavLink to={linkPath} onClick={room.isCallRoom() ? handleStartCall : undefined}>
          <NavItemContent>
            <Box as="span" grow="Yes" alignItems="Center" gap="200">
              <AvatarPresence variant="Background" badge={presenceBadge}>
                <Avatar size="200" radii="400">
                  {avatarContent}
                </Avatar>
              </AvatarPresence>
              <Box as="span" grow="Yes" direction="Column">
                <Text
                  priority={unread ? '500' : '300'}
                  as="span"
                  size="Inherit"
                  style={
                    isVoiceChannel && callMembers.length > 0
                      ? { color: color.Success.Main }
                      : undefined
                  }
                  truncate
                >
                  {displayName}
                </Text>
                {(statusMsg || richPresence) && (
                  <PresenceStatus
                    className={css.DmStatus}
                    status={statusMsg}
                    richPresence={richPresence}
                  />
                )}
              </Box>
              {unencryptedDm && <UnencryptedIcon />}
              {!optionsVisible && !unread && !selected && typingMember.length > 0 && (
                <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
                  <TypingIndicator size="300" disableAnimation />
                </Badge>
              )}
              {!optionsVisible && unread && (
                <UnreadBadgeCenter>
                  <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
                </UnreadBadgeCenter>
              )}
              {!optionsVisible && notificationMode !== RoomNotificationMode.Unset && (
                <Icon
                  size="50"
                  src={getRoomNotificationModeIcon(notificationMode)}
                  aria-label={notificationMode}
                />
              )}
            </Box>
          </NavItemContent>
        </NavLink>
        {optionsVisible && (
          <NavItemOptions>
            {selected && (callEmbed?.roomId === room.roomId || room.isCallRoom()) && (
              <CallChatToggle />
            )}
            <PopOut
              id={`menu-${room.roomId}`}
              aria-expanded={!!menuAnchor}
              anchor={menuAnchor}
              offset={menuAnchor?.width === 0 ? 0 : undefined}
              alignOffset={menuAnchor?.width === 0 ? 0 : -5}
              position="Bottom"
              align={menuAnchor?.width === 0 ? 'Start' : 'End'}
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setMenuAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <RoomNavItemMenu
                    room={room}
                    requestClose={() => setMenuAnchor(undefined)}
                    notificationMode={notificationMode}
                  />
                </FocusTrap>
              }
            >
              <IconButton
                onClick={handleOpenMenu}
                aria-pressed={!!menuAnchor}
                aria-controls={`menu-${room.roomId}`}
                aria-label="More Options"
                variant="Background"
                fill="None"
                size="300"
                radii="300"
              >
                <Icon size="50" src={Icons.VerticalDots} />
              </IconButton>
            </PopOut>
          </NavItemOptions>
        )}
      </NavItem>
      {callMembers.length > 0 && (
        <Box style={{ flexBasis: '100%', width: '100%' }}>
          <CallNavItemMembers room={room} members={callMembers} />
        </Box>
      )}
    </Box>
  );
}

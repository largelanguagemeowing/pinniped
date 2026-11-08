import React, { MouseEventHandler, forwardRef, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Spinner,
  Button,
} from 'folds';
import { useNavigate } from 'react-router-dom';
import { Room } from 'matrix-js-sdk';
import { useAtom, useAtomValue } from 'jotai';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { UserAvatar } from '../../components/user-avatar';
import {
  getMxIdLocalPart,
  getCanonicalAliasOrRoomId,
  isRoomAlias,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { PageHeader } from '../../components/page';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { UseStateProvider } from '../../components/UseStateProvider';
import { RoomTopicViewer } from '../../components/room-topic-viewer';
import { StateEvent } from '../../../types/matrix/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '../../pages/pathUtils';
import { _SearchPathSearchParams } from '../../pages/paths';
import * as css from './RoomViewHeader.css';
import { useRoomUnread } from '../../state/hooks/unread';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { markAsRead } from '../../utils/notifications';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { copyToClipboard } from '../../utils/dom';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomAvatar, useRoomName, useRoomTopic } from '../../hooks/useRoomMeta';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getViaServers } from '../../plugins/via-servers';
import { useMatrixOrgExposure } from '../../hooks/useMatrixOrgExposure';
import { MatrixOrgRoomBadge } from '../../components/server-badge';
import { UnencryptedBadge } from '../../components/unencrypted-indicator';
import { useStateEvent } from '../../hooks/useStateEvent';
import { BackRouteHandler } from '../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { RoomPinMenu } from './room-pin-menu';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import {
  getRoomNotificationMode,
  getRoomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '../../hooks/useRoomsNotificationPreferences';
import { JumpToTime } from './jump-to-time';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { RoomSettingsPage } from '../../state/roomSettings';
import { callChatAtom, callIdleAtom } from '../../state/callEmbed';
import { roomSearchDrawerActiveAtom } from '../../state/roomSearch';
import { RoomSearchBar } from '../message-search/RoomSearchBar';
import { useCallParticipantActivity } from '../../hooks/useCallSpeakers';
import { CallEmbed } from '../../plugins/call/CallEmbed';
import {
  useCallEmbed,
  useCallJoined,
  useCallStart,
  useCallStartPreferences,
} from '../../hooks/useCallEmbed';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);
  const { navigateRoom } = useRoomNavigate();

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

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleOpenSettings = () => {
    openSettings(room.roomId, parentSpace?.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      {invitePrompt && (
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
          onClick={handleOpenSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Room Settings
          </Text>
        </MenuItem>
        <UseStateProvider initial={false}>
          {(promptJump, setPromptJump) => (
            <>
              <MenuItem
                onClick={() => setPromptJump(true)}
                size="300"
                after={<Icon size="100" src={Icons.RecentClock} />}
                radii="300"
                aria-pressed={promptJump}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Jump to Time
                </Text>
              </MenuItem>
              {promptJump && (
                <JumpToTime
                  onSubmit={(eventId) => {
                    setPromptJump(false);
                    navigateRoom(room.roomId, eventId);
                    requestClose();
                  }}
                  onCancel={() => setPromptJump(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
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
});

type CallMenuProps = {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  requestClose: () => void;
};
const CallMenu = forwardRef<HTMLDivElement, CallMenuProps>(
  ({ requestClose, onVoiceCall, onVideoCall }, ref) => {
    const handleVoice = () => {
      onVoiceCall();
      requestClose();
    };
    const handleVideo = () => {
      onVideoCall();
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ padding: config.space.S200, minWidth: toRem(150) }}>
        <Box direction="Column" gap="200">
          <Text size="L400">Start Call</Text>
          <Box direction="Column" gap="200">
            <Button
              size="300"
              variant="Success"
              fill="Soft"
              outlined
              radii="300"
              before={<Icon size="100" src={Icons.Phone} filled />}
              onClick={handleVoice}
            >
              <Text size="B300">Voice</Text>
            </Button>
            <Button
              size="300"
              variant="Success"
              radii="300"
              before={<Icon size="100" src={Icons.VideoCamera} filled />}
              onClick={handleVideo}
            >
              <Text size="B300">Video</Text>
            </Button>
          </Box>
        </Box>
      </Menu>
    );
  }
);

function CallButton() {
  const room = useRoom();
  const direct = useIsDirectRoom();

  const callEmbed = useCallEmbed();
  const startCall = useCallStart(direct);
  const startPreferences = useCallStartPreferences();
  const callStarted = callEmbed && callEmbed.roomId === room.roomId;
  const inAnotherCall = callEmbed && !callStarted;
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <TooltipProvider
        position="Bottom"
        offset={4}
        tooltip={
          <Tooltip>
            {inAnotherCall ? (
              <Text size="L400">Already in another call — End the current call to join!</Text>
            ) : (
              <Text>Call</Text>
            )}
          </Tooltip>
        }
      >
        {(triggerRef) => (
          <IconButton
            variant="Surface"
            fill="None"
            ref={triggerRef}
            onClick={handleOpenMenu}
            onContextMenu={(evt) => {
              evt.preventDefault();
              startCall(room, startPreferences(true));
            }}
            disabled={inAnotherCall || callStarted}
            aria-pressed={!!menuAnchor}
          >
            <Icon size="400" src={Icons.VideoCamera} filled={!!menuAnchor} />
          </IconButton>
        )}
      </TooltipProvider>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="Center"
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
            <CallMenu
              onVideoCall={() => startCall(room, startPreferences(true))}
              onVoiceCall={() => startCall(room, startPreferences(false))}
              requestClose={() => setMenuAnchor(undefined)}
            />
          </FocusTrap>
        }
      />
    </>
  );
}

/** Resolution of the shared screen, read from the call's video element (e.g. "720p"). */
function useStreamQuality(embed?: CallEmbed): string | undefined {
  const [quality, setQuality] = useState<string>();

  useEffect(() => {
    if (!embed) {
      setQuality(undefined);
      return undefined;
    }
    const update = () => {
      const video = embed.document?.querySelector<HTMLVideoElement>('[data-cinny-live] video');
      const height = video?.videoHeight;
      setQuality(height ? `${height}p` : undefined);
    };
    update();
    const timer = setInterval(update, 2000);
    return () => clearInterval(timer);
  }, [embed]);

  return quality;
}

function CallChatToggleButton() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Bottom"
      offset={4}
      tooltip={
        <Tooltip>
          <Text>{chat ? 'Close Chat' : 'Open Chat'}</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <IconButton
          fill="None"
          ref={triggerRef}
          onClick={() => setChat(!chat)}
          aria-pressed={chat}
          aria-label="Toggle chat"
        >
          <Icon size="400" src={Icons.Message} filled={chat} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function RoomViewHeader({ callView }: { callView?: boolean }) {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);

  const hasCallPermission = permissions.stateEvent(
    StateEvent.GroupCallMemberPrefix,
    mx.getSafeUserId()
  );
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const callIdle = useAtomValue(callIdleAtom);
  const embed = useCallEmbed();
  // The black call bar and its idle fade apply only while this room's call is joined.
  const callJoined = useCallJoined(embed);
  const inCall = callView && embed?.roomId === room.roomId && callJoined;
  const { screenSharers } = useCallParticipantActivity(
    embed?.roomId === room.roomId ? embed : undefined
  );
  const [sharerId] = Array.from(screenSharers);
  const sharerName = sharerId
    ? (getMemberDisplayName(room, sharerId) ?? getMxIdLocalPart(sharerId) ?? sharerId)
    : undefined;
  const sharerAvatarMxc = sharerId ? getMemberAvatarMxc(room, sharerId) : undefined;
  const sharerAvatarUrl = sharerAvatarMxc
    ? (mxcUrlToHttp(mx, sharerAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
    : undefined;
  const streamQuality = useStreamQuality(sharerId ? embed : undefined);
  const direct = useIsDirectRoom();

  const pinnedEvents = useRoomPinnedEvents(room);
  const searchDrawerActive = useAtomValue(roomSearchDrawerActiveAtom);
  const avatarMxc = useRoomAvatar(room, direct);
  const matrixOrgExposure = useMatrixOrgExposure(room);
  const encrypted = !!useStateEvent(room, StateEvent.RoomEncryption);
  const unencryptedDm = direct && !encrypted;
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [peopleDrawer, setPeopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');

  const handleSearchClick = () => {
    // On desktop the message search box lives in the top bar and is shown
    // when the member drawer is open. On mobile (no drawer) we navigate to
    // the full search page instead.
    if (screenSize === ScreenSize.Desktop) {
      setPeopleDrawer(true);
      return;
    }
    const searchParams: _SearchPathSearchParams = {
      rooms: room.roomId,
    };
    const path = space
      ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))
      : getHomeSearchPath();
    navigate(withSearchParam(path, searchParams));
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleMemberToggle = () => {
    if (callView) {
      openSettings(room.roomId, parentSpace?.roomId, RoomSettingsPage.MembersPage);
      return;
    }
    setPeopleDrawer(!peopleDrawer);
  };

  let toggleLabel: string;
  if (callView) {
    toggleLabel = 'Members';
  } else if (direct) {
    toggleLabel = peopleDrawer ? 'Hide Profile' : 'Show Profile';
  } else {
    toggleLabel = peopleDrawer ? 'Hide Members' : 'Show Members';
  }

  return (
    <PageHeader
      // The voice room's header has no divider line: it sits on the gradient.
      outlined={!callView}
      className={ContainerColor({ variant: 'Surface' })}
      style={
        inCall
          ? {
              background: '#000',
              opacity: callIdle ? 0 : 1,
              pointerEvents: callIdle ? 'none' : undefined,
              transition: 'opacity 0.3s ease',
            }
          : // Before joining, the voice room's gradient shows through the header.
            callView
            ? { background: 'transparent' }
            : undefined
      }
      balance={screenSize === ScreenSize.Mobile}
    >
      <Box grow="Yes" gap="300">
        {screenSize === ScreenSize.Mobile && (
          <BackRouteHandler>
            {(onBack) => (
              <Box shrink="No" alignItems="Center">
                <IconButton fill="None" onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              </Box>
            )}
          </BackRouteHandler>
        )}
        <Box grow="Yes" alignItems="Center" gap="300">
          {callView && <Icon size="300" src={Icons.VolumeHigh} />}
          {!callView && screenSize !== ScreenSize.Mobile && (
            <Avatar size="300">
              <RoomAvatar
                roomId={room.roomId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => (
                  <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
                )}
              />
            </Avatar>
          )}
          <Box direction="Column">
            <Box alignItems="Center" gap="200">
              <Text size={topic && !callView ? 'H5' : 'H3'} truncate>
                {name}
              </Text>
              {unencryptedDm && <UnencryptedBadge />}
              {!direct && matrixOrgExposure && (
                <MatrixOrgRoomBadge count={matrixOrgExposure.count} />
              )}
              {callView && sharerName && (
                <>
                  <Text size="H3" priority="300">
                    •
                  </Text>
                  <Avatar size="200" radii="Pill">
                    <UserAvatar
                      userId={sharerId}
                      src={sharerAvatarUrl}
                      alt={sharerName}
                      renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                    />
                  </Avatar>
                  <Text size="H5" truncate>
                    {sharerName}&apos;s Screen
                  </Text>
                </>
              )}
            </Box>
            {topic && !callView && (
              <UseStateProvider initial={false}>
                {(viewTopic, setViewTopic) => (
                  <>
                    <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            initialFocus: false,
                            clickOutsideDeactivates: true,
                            onDeactivate: () => setViewTopic(false),
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <RoomTopicViewer
                            name={name}
                            topic={topic}
                            requestClose={() => setViewTopic(false)}
                          />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
                    <Text
                      as="button"
                      type="button"
                      onClick={() => setViewTopic(true)}
                      className={css.HeaderTopic}
                      size="T200"
                      priority="300"
                      truncate
                    >
                      {topic}
                    </Text>
                  </>
                )}
              </UseStateProvider>
            )}
          </Box>
        </Box>

        <Box shrink="No" alignItems="Center" gap="100">
          {!callView && screenSize !== ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Search</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={handleSearchClick}
                  aria-label="Search messages"
                >
                  <Icon size="400" src={Icons.Search} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {!callView && (
            <>
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>Pinned Messages</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton
                    fill="None"
                    style={{ position: 'relative' }}
                    onClick={handleOpenPinMenu}
                    ref={triggerRef}
                    aria-pressed={!!pinMenuAnchor}
                  >
                    {pinnedEvents.length > 0 && (
                      <Badge
                        style={{
                          position: 'absolute',
                          left: toRem(3),
                          top: toRem(3),
                        }}
                        variant="Secondary"
                        size="400"
                        fill="Solid"
                        radii="Pill"
                      >
                        <Text as="span" size="L400">
                          {pinnedEvents.length}
                        </Text>
                      </Badge>
                    )}
                    <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
                  </IconButton>
                )}
              </TooltipProvider>
              <PopOut
                anchor={pinMenuAnchor}
                position="Bottom"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      returnFocusOnDeactivate: false,
                      onDeactivate: () => setPinMenuAnchor(undefined),
                      clickOutsideDeactivates: true,
                      isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                      isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <RoomPinMenu room={room} requestClose={() => setPinMenuAnchor(undefined)} />
                  </FocusTrap>
                }
              />
            </>
          )}
          {!callView &&
            !room.isCallRoom() &&
            livekitSupported &&
            rtcSupported &&
            hasCallPermission && <CallButton />}
          {callView && sharerName && (
            <Box alignItems="Center">
              {streamQuality && (
                <Badge variant="Primary" fill="Solid" radii="300" size="400">
                  <Text as="span" size="L400">
                    {streamQuality}
                  </Text>
                </Badge>
              )}
              <Badge variant="Critical" fill="Solid" radii="300" size="400">
                <Text as="span" size="L400">
                  LIVE
                </Text>
              </Badge>
            </Box>
          )}
          {callView && <CallChatToggleButton />}
          {!callView && screenSize === ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{toggleLabel}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton fill="None" ref={triggerRef} onClick={handleMemberToggle}>
                  <Icon size="400" src={Icons.User} />
                </IconButton>
              )}
            </TooltipProvider>
          )}

          {!callView && (
            <>
              <TooltipProvider
                position="Bottom"
                align="End"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>More Options</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton
                    fill="None"
                    onClick={handleOpenMenu}
                    ref={triggerRef}
                    aria-pressed={!!menuAnchor}
                  >
                    <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
                  </IconButton>
                )}
              </TooltipProvider>
              <PopOut
                anchor={menuAnchor}
                position="Bottom"
                align="End"
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
                    <RoomMenu room={room} requestClose={() => setMenuAnchor(undefined)} />
                  </FocusTrap>
                }
              />
            </>
          )}
          {!callView && screenSize === ScreenSize.Desktop && (
            <Box
              onFocusCapture={() => {
                if (!searchDrawerActive) handleSearchClick();
              }}
            >
              <RoomSearchBar />
            </Box>
          )}
        </Box>
      </Box>
    </PageHeader>
  );
}

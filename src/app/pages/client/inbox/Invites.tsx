import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { useAtomValue } from 'jotai';
import { RoomTopicEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
import { MatrixClient, MatrixError, Room } from 'matrix-js-sdk';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroEmpty,
  PageHeroSection,
} from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { allInvitesAtom } from '../../../state/room-list/inviteList';
import { SequenceCard } from '../../../components/sequence-card';
import {
  bannedInRooms,
  getCommonRooms,
  getDirectRoomAvatarUrl,
  getMemberDisplayName,
  getRoomAvatarUrl,
  getStateEvent,
  isDirectInvite,
  isSpace,
  getRoomName,
} from '../../../utils/room';
import { nameInitials } from '../../../utils/common';
import { RoomAvatar } from '../../../components/room-avatar';
import {
  addRoomIdToMDirect,
  getMxIdLocalPart,
  guessDmRoomUserId,
  rateLimitedActions,
} from '../../../utils/matrix';
import { Time } from '../../../components/message';
import { useElementSizeObserver } from '../../../hooks/useElementSizeObserver';
import { onEnterOrSpace, stopPropagation } from '../../../utils/keyboard';
import { RoomTopicViewer } from '../../../components/room-topic-viewer';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { StateEvent } from '../../../../types/matrix/room';
import { testBadWords } from '../../../plugins/bad-words';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useIgnoredUsers } from '../../../hooks/useIgnoredUsers';
import { useReportRoomSupported } from '../../../hooks/useReportRoomSupported';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { stripOptionalText } from '../../../utils/sanitize';

const COMPACT_CARD_WIDTH = 548;

type InviteData = {
  room: Room;
  roomId: string;
  roomName: string;
  roomAvatar?: string;
  roomTopic?: string;
  roomAlias?: string;

  senderId: string;
  senderName: string;
  inviteTs?: number;
  reason?: string;

  isSpace: boolean;
  isDirect: boolean;
  isEncrypted: boolean;
};

const makeInviteData = (mx: MatrixClient, room: Room, useAuthentication: boolean): InviteData => {
  const userId = mx.getSafeUserId();
  const direct = isDirectInvite(room, userId);

  const roomAvatar = direct
    ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
    : getRoomAvatarUrl(mx, room, 96, useAuthentication);
  const roomName = getRoomName(room) || room.getCanonicalAlias() || room.roomId;
  const roomTopic = stripOptionalText(
    getStateEvent(room, StateEvent.RoomTopic)?.getContent<RoomTopicEventContent>()?.topic ??
      undefined
  );

  const member = room.getMember(userId);
  const memberEvent = member?.events.member;

  const content = memberEvent?.getContent();
  const senderId = memberEvent?.getSender();

  const senderName = senderId
    ? (getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId)
    : undefined;
  const inviteTs = memberEvent?.getTs();
  const reason =
    content && 'reason' in content && typeof content.reason === 'string'
      ? content.reason
      : undefined;

  return {
    room,
    roomId: room.roomId,
    roomAvatar,
    roomName,
    roomTopic,
    roomAlias: room.getCanonicalAlias() ?? undefined,

    senderId: senderId ?? 'Unknown',
    senderName: senderName ?? 'Unknown',
    inviteTs,
    reason,

    isSpace: isSpace(room),
    isDirect: direct,
    isEncrypted: !!getStateEvent(room, StateEvent.RoomEncryption),
  };
};

const hasBadWords = (invite: InviteData): boolean =>
  testBadWords(invite.roomName) ||
  testBadWords(invite.roomTopic ?? '') ||
  testBadWords(invite.senderName) ||
  testBadWords(invite.senderId) ||
  testBadWords(invite.reason || '');

type NavigateHandler = (roomId: string, space: boolean) => void;

type InviteCardProps = {
  invite: InviteData;
  compact?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  onNavigate: NavigateHandler;
  hideAvatar: boolean;
};
function useDeclineConfirm(message: string, onConfirm: () => void) {
  const [open, setOpen] = useState(false);
  const dialog = open && (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setOpen(false),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Decline Invite</Text>
              </Box>
              <IconButton size="300" onClick={() => setOpen(false)} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text priority="400">{message}</Text>
              <Button
                variant="Critical"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                <Text size="B400">Decline</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
  return { ask: () => setOpen(true), dialog };
}

function InviteCard({
  invite,
  compact,
  hour24Clock,
  dateFormatString,
  onNavigate,
  hideAvatar,
}: InviteCardProps) {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();

  const [viewTopic, setViewTopic] = useState(false);
  const closeTopic = () => setViewTopic(false);
  const openTopic = () => setViewTopic(true);

  const [joinState, join] = useAsyncCallback<void, MatrixError, []>(
    useCallback(async () => {
      const dmUserId = isDirectInvite(invite.room, userId)
        ? guessDmRoomUserId(invite.room, userId)
        : undefined;

      await mx.joinRoom(invite.roomId);
      if (dmUserId) {
        await addRoomIdToMDirect(mx, invite.roomId, dmUserId);
      }
      onNavigate(invite.roomId, invite.isSpace);
    }, [mx, invite, userId, onNavigate])
  );
  const [leaveState, leave] = useAsyncCallback<Record<string, never>, MatrixError, []>(
    useCallback(() => mx.leave(invite.roomId), [mx, invite])
  );

  const declineConfirm = useDeclineConfirm('Are you sure you want to decline this invite?', leave);
  const joining =
    joinState.status === AsyncStatus.Loading || joinState.status === AsyncStatus.Success;
  const leaving =
    leaveState.status === AsyncStatus.Loading || leaveState.status === AsyncStatus.Success;

  const details = [
    invite.isDirect && 'Direct Message',
    invite.isSpace && 'Space',
    invite.isEncrypted && 'Encrypted',
  ].filter(Boolean);
  const subtitle = invite.reason ? `Reason: ${invite.reason}` : invite.roomTopic;

  return (
    <Box
      direction={compact ? 'Column' : 'Row'}
      alignItems={compact ? 'Stretch' : 'Center'}
      gap="300"
      style={{
        padding: `${config.space.S300} ${config.space.S200}`,
        borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
      }}
    >
      <Box grow="Yes" gap="300" alignItems="Center" style={{ minWidth: 0 }}>
        <Avatar size="400">
          <RoomAvatar
            roomId={invite.roomId}
            src={hideAvatar ? undefined : invite.roomAvatar}
            alt={invite.roomName}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(hideAvatar && invite.roomAvatar ? undefined : invite.roomName)}
              </Text>
            )}
          />
        </Avatar>
        <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
          <Box gap="200" alignItems="Baseline">
            <Text size="T300" truncate>
              <b>{invite.roomName}</b>
            </Text>
            {typeof invite.inviteTs === 'number' && invite.inviteTs !== 0 && (
              <Box shrink="No">
                <Time
                  size="T200"
                  ts={invite.inviteTs}
                  hour24Clock={hour24Clock}
                  dateFormatString={dateFormatString}
                  priority="300"
                />
              </Box>
            )}
          </Box>
          <Text size="T200" priority="300" truncate>
            From {invite.senderId}
            {details.length > 0 && ` · ${details.join(' · ')}`}
          </Text>
          {subtitle && (
            <Text
              size="T200"
              priority="300"
              onClick={invite.reason ? undefined : openTopic}
              onKeyDown={invite.reason ? undefined : onEnterOrSpace(openTopic)}
              tabIndex={invite.reason ? undefined : 0}
              truncate
            >
              {subtitle}
            </Text>
          )}
          {joinState.status === AsyncStatus.Error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {joinState.error.message}
            </Text>
          )}
          {leaveState.status === AsyncStatus.Error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {leaveState.error.message}
            </Text>
          )}
        </Box>
      </Box>
      <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: closeTopic,
              escapeDeactivates: stopPropagation,
            }}
          >
            <RoomTopicViewer
              name={invite.roomName}
              topic={invite.roomTopic ?? ''}
              requestClose={closeTopic}
            />
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Box gap="200" shrink="No" alignItems="Center">
        <Button
          onClick={join}
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          disabled={joining || leaving}
          before={joining ? <Spinner variant="Secondary" size="100" /> : undefined}
        >
          <Text size="B300">Accept</Text>
        </Button>
        <Button
          onClick={declineConfirm.ask}
          size="300"
          variant="Critical"
          fill="Solid"
          radii="300"
          disabled={joining || leaving}
          before={leaving ? <Spinner variant="Critical" fill="Solid" size="100" /> : undefined}
        >
          <Text size="B300">Decline</Text>
        </Button>
      </Box>
      {declineConfirm.dialog}
    </Box>
  );
}

enum InviteFilter {
  Known,
  Unknown,
  Spam,
}
type InviteFiltersProps = {
  filter: InviteFilter;
  onFilter: (filter: InviteFilter) => void;
  knownInvites: InviteData[];
  unknownInvites: InviteData[];
  spamInvites: InviteData[];
};
function InviteFilters({
  filter,
  onFilter,
  knownInvites,
  unknownInvites,
  spamInvites,
}: InviteFiltersProps) {
  const isKnown = filter === InviteFilter.Known;
  const isUnknown = filter === InviteFilter.Unknown;
  const isSpam = filter === InviteFilter.Spam;

  return (
    <Box gap="200">
      <Chip
        variant={isKnown ? 'Success' : 'Surface'}
        aria-selected={isKnown}
        outlined={!isKnown}
        onClick={() => onFilter(InviteFilter.Known)}
        before={isKnown && <Icon size="100" src={Icons.Check} />}
        after={
          knownInvites.length > 0 && (
            <Badge variant={isKnown ? 'Success' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{knownInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">Primary</Text>
      </Chip>
      <Chip
        variant={isUnknown ? 'Warning' : 'Surface'}
        aria-selected={isUnknown}
        outlined={!isUnknown}
        onClick={() => onFilter(InviteFilter.Unknown)}
        before={isUnknown && <Icon size="100" src={Icons.Check} />}
        after={
          unknownInvites.length > 0 && (
            <Badge variant={isUnknown ? 'Warning' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{unknownInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">Public</Text>
      </Chip>
      <Chip
        variant={isSpam ? 'Critical' : 'Surface'}
        aria-selected={isSpam}
        outlined={!isSpam}
        onClick={() => onFilter(InviteFilter.Spam)}
        before={isSpam && <Icon size="100" src={Icons.Check} />}
        after={
          spamInvites.length > 0 && (
            <Badge variant={isSpam ? 'Critical' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{spamInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">Spam</Text>
      </Chip>
    </Box>
  );
}

type KnownInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function KnownInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: KnownInvitesProps) {
  return (
    <Box direction="Column" gap="200">
      <Text size="L400" priority="300">
        Primary – {invites.length}
      </Text>
      {invites.length > 0 ? (
        <Box direction="Column">
          {invites.map((invite) => (
            <InviteCard
              key={invite.roomId}
              invite={invite}
              compact={compact}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onNavigate={handleNavigate}
              hideAvatar={false}
            />
          ))}
        </Box>
      ) : (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Mail} />}
              title="No Invites"
              subTitle="When someone you share a room with sends you an invite, it’ll show up here."
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}
    </Box>
  );
}

type UnknownInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function UnknownInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: UnknownInvitesProps) {
  const mx = useMatrixClient();

  const [declineAllStatus, declineAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.leave(roomId));
    }, [mx, invites])
  );

  const declining = declineAllStatus.status === AsyncStatus.Loading;
  const declineConfirm = useDeclineConfirm(
    `Are you sure you want to decline all ${invites.length} invites?`,
    declineAll
  );

  return (
    <Box direction="Column" gap="200">
      <Box gap="200" justifyContent="SpaceBetween" alignItems="Center">
        <Text size="L400" priority="300">
          Public – {invites.length}
        </Text>
        <Box>
          {invites.length > 0 && (
            <Chip
              variant="SurfaceVariant"
              onClick={declineConfirm.ask}
              before={declining && <Spinner size="50" variant="Secondary" fill="Soft" />}
              disabled={declining}
              radii="Pill"
            >
              <Text size="T200">Decline All</Text>
            </Chip>
          )}
          {declineConfirm.dialog}
        </Box>
      </Box>
      {invites.length > 0 ? (
        <Box direction="Column">
          {invites.map((invite) => (
            <InviteCard
              key={invite.roomId}
              invite={invite}
              compact={compact}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onNavigate={handleNavigate}
              hideAvatar
            />
          ))}
        </Box>
      ) : (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Info} />}
              title="No Invites"
              subTitle="Invites from people outside your rooms will appear here."
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}
    </Box>
  );
}

type SpamInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function SpamInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: SpamInvitesProps) {
  const mx = useMatrixClient();
  const [showInvites, setShowInvites] = useState(false);

  const reportRoomSupported = useReportRoomSupported();

  const [declineAllStatus, declineAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.leave(roomId));
    }, [mx, invites])
  );

  const [reportAllStatus, reportAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.reportRoom(roomId, 'Spam Invite'));
    }, [mx, invites])
  );

  const ignoredUsers = useIgnoredUsers();
  const unignoredUsers = Array.from(new Set(invites.map((invite) => invite.senderId))).filter(
    (user) => !ignoredUsers.includes(user)
  );
  const [blockAllStatus, blockAll] = useAsyncCallback(
    useCallback(
      () => mx.setIgnoredUsers([...ignoredUsers, ...unignoredUsers]),
      [mx, ignoredUsers, unignoredUsers]
    )
  );

  const declining = declineAllStatus.status === AsyncStatus.Loading;
  const declineConfirm = useDeclineConfirm(
    `Are you sure you want to decline all ${invites.length} invites?`,
    declineAll
  );
  const reporting = reportAllStatus.status === AsyncStatus.Loading;
  const blocking = blockAllStatus.status === AsyncStatus.Loading;
  const loading = blocking || reporting || declining;

  return (
    <Box direction="Column" gap="200">
      <Text size="L400" priority="300">
        Spam – {invites.length}
      </Text>
      {invites.length > 0 ? (
        <Box direction="Column" gap="100">
          <SequenceCard
            variant="SurfaceVariant"
            direction="Column"
            gap="300"
            style={{ padding: `${config.space.S400} ${config.space.S400} 0` }}
          >
            <PageHeroSection>
              <PageHero
                icon={<Icon size="600" src={Icons.Warning} />}
                title={`${invites.length} Spam Invites`}
                subTitle="Some of the following invites may contain harmful content or have been sent by banned users."
              >
                <Box direction="Row" gap="200" justifyContent="Center" wrap="Wrap">
                  <Button
                    size="300"
                    variant="Critical"
                    fill="Solid"
                    radii="300"
                    onClick={declineConfirm.ask}
                    before={declining && <Spinner size="100" variant="Critical" fill="Solid" />}
                    disabled={loading}
                  >
                    <Text size="B300" truncate>
                      Decline All
                    </Text>
                  </Button>
                  {declineConfirm.dialog}
                  {reportRoomSupported && reportAllStatus.status !== AsyncStatus.Success && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Solid"
                      radii="300"
                      onClick={reportAll}
                      before={reporting && <Spinner size="100" variant="Secondary" fill="Solid" />}
                      disabled={loading}
                    >
                      <Text size="B300" truncate>
                        Report All
                      </Text>
                    </Button>
                  )}
                  {unignoredUsers.length > 0 && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Solid"
                      radii="300"
                      disabled={loading}
                      onClick={blockAll}
                      before={blocking && <Spinner size="100" variant="Secondary" fill="Solid" />}
                    >
                      <Text size="B300" truncate>
                        Block All
                      </Text>
                    </Button>
                  )}
                </Box>

                <span data-spacing-node />

                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="Pill"
                  before={
                    <Icon size="100" src={showInvites ? Icons.ChevronTop : Icons.ChevronBottom} />
                  }
                  onClick={() => setShowInvites(!showInvites)}
                >
                  <Text size="B300">{showInvites ? 'Hide All' : 'View All'}</Text>
                </Button>
              </PageHero>
            </PageHeroSection>
          </SequenceCard>
          {showInvites &&
            invites.map((invite) => (
              <InviteCard
                key={invite.roomId}
                invite={invite}
                compact={compact}
                hour24Clock={hour24Clock}
                dateFormatString={dateFormatString}
                onNavigate={handleNavigate}
                hideAvatar
              />
            ))}
        </Box>
      ) : (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Warning} />}
              title="No Spam Invites"
              subTitle="Invites detected as spam appear here."
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}
    </Box>
  );
}

export function Invites() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const allRooms = useAtomValue(allRoomsAtom);
  const allInviteIds = useAtomValue(allInvitesAtom);

  const [filter, setFilter] = useState(InviteFilter.Known);

  const invitesData = allInviteIds
    .map((inviteId) => mx.getRoom(inviteId))
    .filter((inviteRoom) => !!inviteRoom)
    .map((inviteRoom) => makeInviteData(mx, inviteRoom, useAuthentication));

  const [knownInvites, unknownInvites, spamInvites] = useMemo(() => {
    const known: InviteData[] = [];
    const unknown: InviteData[] = [];
    const spam: InviteData[] = [];
    invitesData.forEach((invite) => {
      if (hasBadWords(invite) || bannedInRooms(mx, allRooms, invite.senderId)) {
        spam.push(invite);
        return;
      }

      if (getCommonRooms(mx, allRooms, invite.senderId).length === 0) {
        unknown.push(invite);
        return;
      }

      known.push(invite);
    });

    return [known, unknown, spam];
  }, [mx, allRooms, invitesData]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(document.body.clientWidth <= COMPACT_CARD_WIDTH);
  useElementSizeObserver(
    useCallback(() => containerRef.current, []),
    useCallback((width) => setCompact(width <= COMPACT_CARD_WIDTH), [])
  );
  const screenSize = useScreenSizeContext();

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const handleNavigate = (roomId: string, space: boolean) => {
    if (space) {
      navigateSpace(roomId);
      return;
    }
    navigateRoom(roomId);
  };

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" basis="No">
            {screenSize === ScreenSize.Mobile && (
              <BackRouteHandler>
                {(onBack) => (
                  <IconButton onClick={onBack}>
                    <Icon src={Icons.ArrowLeft} />
                  </IconButton>
                )}
              </BackRouteHandler>
            )}
          </Box>
          <Box alignItems="Center" gap="200">
            {screenSize !== ScreenSize.Mobile && <Icon size="400" src={Icons.Mail} />}
            <Text size="H3" truncate>
              Invites
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box ref={containerRef} direction="Column" gap="600">
                <Box direction="Column" gap="100">
                  <span data-spacing-node />
                  <Text size="L400">Filter</Text>
                  <InviteFilters
                    filter={filter}
                    onFilter={setFilter}
                    knownInvites={knownInvites}
                    unknownInvites={unknownInvites}
                    spamInvites={spamInvites}
                  />
                </Box>
                {filter === InviteFilter.Known && (
                  <KnownInvites
                    invites={knownInvites}
                    compact={compact}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}

                {filter === InviteFilter.Unknown && (
                  <UnknownInvites
                    invites={unknownInvites}
                    compact={compact}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}

                {filter === InviteFilter.Spam && (
                  <SpamInvites
                    invites={spamInvites}
                    compact={compact}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

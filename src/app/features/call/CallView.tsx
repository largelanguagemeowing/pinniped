import React, { RefObject, useRef } from 'react';
import { Box, color, Text, toRem } from 'folds';
import {
  useCallEmbed,
  useCallJoined,
  useCallEmbedPlacementSync,
  useCallIdle,
} from '../../hooks/useCallEmbed';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { PrescreenControls } from './PrescreenControls';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { StateEvent } from '../../../types/matrix/room';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { CallMemberRenderer } from './CallMemberCard';
import * as css from './styles.css';
import { CallControls } from './CallControls';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { getMemberDisplayName, getRoomName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { type Room } from 'matrix-js-sdk';
import { type CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';

function LivekitServerMissingMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your homeserver does not support calling.
    </Text>
  );
}

function WebRTCMissingError() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your browser does not support WebRTC, which is required for calling.
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
  rtcSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
  rtcSupported?: boolean;
}) {
  if (rtcSupported === false) {
    return <WebRTCMissingError />;
  }

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  if (hasParticipant) return null;

  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      No one is currently in voice
    </Text>
  );
}

/** "A and B are currently in voice", or "A, B and N others are currently in voice". */
function voiceSummary(room: Room, members: CallMembership[]): string {
  const names = members
    .map((m) => m.userId)
    .filter((id): id is string => !!id)
    .map((id) => getMemberDisplayName(room, id) ?? getMxIdLocalPart(id) ?? id);
  if (names.length === 1) return `${names[0]} is currently in voice`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are currently in voice`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others are currently in voice`;
}

function NoPermissionMessage() {
  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      You don&#39;t have permission to join!
    </Text>
  );
}

function AlreadyInCallMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Warning.Main }} size="L400" align="Center">
      Already in another call — End the current call to join!
    </Text>
  );
}

function CallPrescreen() {
  const mx = useMatrixClient();
  const room = useRoom();
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const hasPermission = permissions.stateEvent(
    StateEvent.GroupCallMemberPrefix,
    mx.getSafeUserId()
  );

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);
  const hasParticipant = callMembers.length > 0;

  const callEmbed = useCallEmbed();
  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const canJoin = hasPermission && livekitSupported && rtcSupported;

  return (
    <Box className={css.PrescreenBackground} grow="Yes" alignItems="Center" justifyContent="Center">
      <Box
        style={{ maxWidth: toRem(420), width: '100%' }}
        direction="Column"
        gap="300"
        alignItems="Center"
      >
        <Text size="H3" align="Center" truncate>
          {getRoomName(room)}
        </Text>
        {hasParticipant && (
          <Text size="B400" align="Center" priority="300">
            {voiceSummary(room, callMembers)}
          </Text>
        )}
        <CallMemberRenderer members={callMembers} />
        <PrescreenControls canJoin={canJoin} />
        <Box className={css.PrescreenMessage} alignItems="Center">
          {!inOtherCall &&
            (hasPermission ? (
              <JoinMessage
                hasParticipant={hasParticipant}
                livekitSupported={livekitSupported}
                rtcSupported={rtcSupported}
              />
            ) : (
              <NoPermissionMessage />
            ))}
          {inOtherCall && <AlreadyInCallMessage />}
        </Box>
      </Box>
    </Box>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  joined: boolean;
};
function CallJoined({ joined, containerRef }: CallJoinedProps) {
  const callEmbed = useCallEmbed();

  return (
    // Takes no room until joined, so the prescreen can fill the view.
    <Box grow={joined ? 'Yes' : 'No'} direction="Column">
      <Box grow="Yes" ref={containerRef} />
      {callEmbed && joined && <CallControls callEmbed={callEmbed} />}
    </Box>
  );
}

export function CallView() {
  const room = useRoom();
  const callContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callContainerRef);

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);

  const currentJoined = callEmbed?.roomId === room.roomId && callJoined;
  useCallIdle(currentJoined ? callEmbed : undefined);

  return (
    <Box
      className={ContainerColor({ variant: 'Surface' })}
      style={{ minWidth: toRem(280), background: currentJoined ? '#000' : 'transparent' }}
      grow="Yes"
    >
      {!currentJoined && <CallPrescreen />}
      <CallJoined joined={currentJoined} containerRef={callContainerRef} />
    </Box>
  );
}

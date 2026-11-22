import React, { useCallback, useEffect, useState } from 'react';
import { Box, color, PopOut, RectCords, Text, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallIdle } from '../../hooks/useActiveCall';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { PrescreenControls } from './PrescreenControls';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { StateEvent } from '../../../types/matrix/room';
import { useCall, useCallMembers, useCallSession } from '../../hooks/useCall';
import { CallMemberRenderer } from './CallMemberCard';
import * as css from './styles.css';
import { CallControls } from './CallControls';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { getMemberDisplayName, getRoomName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { type Room } from 'matrix-js-sdk';
import { type CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import type { Call } from '../../plugins/call/Call';
import {
  callFailureAtom,
  callFullscreenAtom,
  callIdleAtom,
  callStreamHeightAtom,
} from '../../state/call';
import { type ElementCallError } from '../../plugins/call/engine/utils/errors';
import { stopPropagation } from '../../utils/keyboard';
import { CallMemberMenu } from './CallMemberMenu';
import { CallStage } from './stage';

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

function CallFailedMessage({ error }: { error: ElementCallError }) {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      {error.localisedMessage
        ? `${error.localisedTitle}: ${error.localisedMessage}`
        : error.localisedTitle}
    </Text>
  );
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

  const call = useCall();
  const inOtherCall = call && call.roomId !== room.roomId;

  const canJoin = hasPermission && livekitSupported && rtcSupported;
  const failure = useAtomValue(callFailureAtom);
  const failed = failure?.roomId === room.roomId ? failure.error : undefined;

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
          {failed && !inOtherCall && <CallFailedMessage error={failed} />}
          {!failed &&
            !inOtherCall &&
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
  call: Call;
};
function CallJoined({ call }: CallJoinedProps) {
  const mx = useMatrixClient();
  const idle = useAtomValue(callIdleAtom);
  const fullscreen = useAtomValue(callFullscreenAtom);
  const setStreamHeight = useSetAtom(callStreamHeightAtom);
  const [menu, setMenu] = useState<{ userId: string; cords: RectCords }>();

  // Nothing is watched once the call view is gone.
  useEffect(() => () => setStreamHeight(null), [setStreamHeight]);

  const handleMemberMenu = useCallback(
    (userId: string, cords: RectCords) => setMenu({ userId, cords }),
    []
  );

  return (
    <Box grow="Yes" direction="Column" style={{ position: 'relative' }}>
      <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
        <CallStage
          call={call}
          idle={idle}
          onMemberMenu={handleMemberMenu}
          onStreamHeightChange={setStreamHeight}
        />
      </Box>
      {/* Fullscreen gives the stream the whole screen; the controls float over its bottom edge. */}
      <div className={fullscreen ? css.FullscreenControls : undefined}>
        <CallControls call={call} />
      </div>
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
                roomId={call.roomId}
                userId={menu.userId}
                cords={menu.cords}
                call={menu.userId === mx.getSafeUserId() ? call : undefined}
                requestClose={() => setMenu(undefined)}
              />
            </FocusTrap>
          )
        }
      />
    </Box>
  );
}

export function CallView() {
  const room = useRoom();
  const call = useCall();
  const roomCall = call?.roomId === room.roomId ? call : undefined;
  useCallIdle(roomCall !== undefined);

  return (
    <Box
      className={ContainerColor({ variant: 'Surface' })}
      style={{ minWidth: toRem(280), background: roomCall ? '#000' : 'transparent' }}
      grow="Yes"
    >
      {roomCall ? <CallJoined call={roomCall} /> : <CallPrescreen />}
    </Box>
  );
}

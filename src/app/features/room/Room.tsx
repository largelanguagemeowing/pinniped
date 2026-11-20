import React from 'react';
import { Box, Line } from 'folds';
import { useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { RoomView } from './RoomView';
import { RoomSearchDrawer } from './RoomSearchDrawer';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { PowerLevelsContextProvider, usePowerLevels } from '../../hooks/usePowerLevels';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { CallView } from '../call/CallView';
import { RoomViewHeader } from './RoomViewHeader';
import { callChatAtom, callFullscreenAtom } from '../../state/call';
import { CallChatView } from './CallChatView';
import * as callCss from '../call/styles.css';
import { useCall, useCallMembers, useCallSession } from '../../hooks/useCall';
import { DmCallSplit } from './DmCallSplit';

export function Room() {
  const { eventId } = useParams();
  const room = useRoom();
  const mx = useMatrixClient();

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);
  const call = useCall();
  const inCall = call?.roomId === room.roomId;

  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const screenSize = useScreenSizeContext();
  const powerLevels = usePowerLevels(room);
  const members = useRoomMembers(mx, room.roomId);
  const chat = useAtomValue(callChatAtom);
  const direct = useIsDirectRoom();

  const callView = inCall || room.isCallRoom() || callMembers.length > 0;

  // In DMs the call sits above the chat instead of replacing it.
  const dmSplit = callView && direct && !room.isCallRoom();

  // In fullscreen only the call view is left. The rest is hidden rather than unmounted, so the call
  // view is not rebuilt and the chat and drawer keep their place.
  const fullscreen = useAtomValue(callFullscreenAtom) && inCall;
  const hiddenInFullscreen = { display: fullscreen ? 'none' : 'contents' };

  return (
    <PowerLevelsContextProvider value={powerLevels}>
      <Box grow="Yes">
        {!dmSplit && callView && (screenSize === ScreenSize.Desktop || !chat) && (
          <Box
            grow="Yes"
            direction="Column"
            className={inCall ? undefined : callCss.PrescreenGradient}
          >
            <div style={hiddenInFullscreen}>
              <RoomViewHeader callView />
            </div>
            <Box grow="Yes">
              <CallView />
            </Box>
          </Box>
        )}
        {!dmSplit && callView && chat && (
          <div style={hiddenInFullscreen}>
            {screenSize === ScreenSize.Desktop && (
              <Line variant="Background" direction="Vertical" size="300" />
            )}
            <CallChatView />
          </div>
        )}
        {/* The header spans the chat and the drawer, so they read as one bar. */}
        {(!callView || dmSplit) && (
          <Box grow="Yes" direction="Column">
            <div style={hiddenInFullscreen}>
              <RoomViewHeader />
            </div>
            <Box grow="Yes">
              {dmSplit ? (
                <DmCallSplit
                  call={<CallView />}
                  chat={<RoomView eventId={eventId} />}
                  callOnly={fullscreen}
                />
              ) : (
                <Box grow="Yes">
                  <RoomView eventId={eventId} />
                </Box>
              )}
              {screenSize === ScreenSize.Desktop && isDrawer && (
                <div style={hiddenInFullscreen}>
                  <Line variant="Background" direction="Vertical" size="300" />
                  <RoomSearchDrawer key={room.roomId} room={room} members={members} />
                </div>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}

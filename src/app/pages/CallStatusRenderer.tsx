import React from 'react';
import { useCall } from '../hooks/useCall';
import { CallStatus } from '../features/call-status';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

export function CallStatusRenderer() {
  const call = useCall();
  const selectedRoom = useSelectedRoom();

  const screenSize = useScreenSizeContext();

  if (!call) return null;

  if (screenSize === ScreenSize.Mobile && call.roomId === selectedRoom) return null;

  return <CallStatus call={call} />;
}

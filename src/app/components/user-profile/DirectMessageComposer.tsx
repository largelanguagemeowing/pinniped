import React, { FormEventHandler, useCallback, useState } from 'react';
import { MsgType } from 'matrix-js-sdk';
import { Box, color, Icon, IconButton, Icons, Input, Spinner, Text } from 'folds';
import { useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { getDMRoomFor, getMxIdLocalPart } from '../../utils/matrix';
import {
  createDirectChat,
  DEFAULT_DIRECT_ROOM_VERSION,
  DirectRoomVersion,
} from '../../utils/directRoom';
import { DirectRoomVersionSelect } from '../direct-room-version';
import { getHomeRoomPath } from '../../pages/pathUtils';
import { useCloseUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { BreakWord } from '../../styles/Text.css';

type DirectMessageComposerProps = {
  userId: string;
};

export function DirectMessageComposer({ userId }: DirectMessageComposerProps) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const closeProfile = useCloseUserRoomProfile();
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState<DirectRoomVersion>(DEFAULT_DIRECT_ROOM_VERSION);
  const [choosingVersion, setChoosingVersion] = useState(false);
  // the version is only chosen for a chat that does not exist yet
  const newChat = !getDMRoomFor(mx, userId);
  const username = getMxIdLocalPart(userId) ?? userId;

  const [sendState, send] = useAsyncCallback<string, Error, [string]>(
    useCallback(
      async (body) => {
        let roomId = getDMRoomFor(mx, userId)?.roomId;
        if (!roomId) {
          roomId = await createDirectChat(mx, userId, { version });
        }

        await mx.sendMessage(roomId, { msgtype: MsgType.Text, body });
        return roomId;
      },
      [mx, userId, version]
    )
  );

  const sending = sendState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const body = message.trim();
    if (!body || sending) return;

    send(body)
      .then((roomId) => {
        closeProfile();
        navigate(getHomeRoomPath(roomId));
      })
      .catch(() => undefined);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box alignItems="Center" gap="100">
        <Box grow="Yes">
          <Input
            aria-label={`Message ${userId}`}
            placeholder={`Message @${username}`}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            variant="SurfaceVariant"
            size="400"
            radii="300"
            style={{ width: '100%' }}
            disabled={sending}
          />
        </Box>
        {newChat && (
          <IconButton
            type="button"
            aria-label="Room version"
            aria-pressed={choosingVersion}
            variant="SurfaceVariant"
            size="400"
            radii="300"
            onClick={() => setChoosingVersion(!choosingVersion)}
          >
            <Icon src={Icons.Setting} size="100" />
          </IconButton>
        )}
        <IconButton
          type="submit"
          aria-label="Send direct message"
          variant="Primary"
          size="400"
          radii="300"
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <Spinner variant="Primary" fill="Solid" size="100" />
          ) : (
            <Icon src={Icons.Send} size="100" />
          )}
        </IconButton>
      </Box>
      {newChat && choosingVersion && (
        <DirectRoomVersionSelect value={version} onChange={setVersion} disabled={sending} />
      )}
      {sendState.status === AsyncStatus.Error && (
        <Text className={BreakWord} size="T200" style={{ color: color.Critical.Main }}>
          {sendState.error.message}
        </Text>
      )}
    </Box>
  );
}

import React, { useEffect, useState } from 'react';
import { Box, Button, Text } from 'folds';
import { ServerPicker } from './ServerPicker';

type HomeserverRowProps = {
  server: string;
  serverList: string[];
  allowCustomServer?: boolean;
  // Keeps the picker open so a failed lookup can be corrected without an extra click.
  forceOpen?: boolean;
  onServerChange: (server: string) => void;
};

/**
 * The homeserver is a technical detail most people never change, so it reads as one line
 * under the form and only opens the picker on request.
 */
export function HomeserverRow({
  server,
  serverList,
  allowCustomServer,
  forceOpen,
  onServerChange,
}: HomeserverRowProps) {
  const [editing, setEditing] = useState(false);
  const canChange = allowCustomServer || serverList.length > 1;

  // A new server was chosen, so the picker has done its job.
  useEffect(() => setEditing(false), [server]);

  if (editing || forceOpen) {
    return (
      <Box direction="Column" gap="100">
        <Text as="label" size="L400" priority="300">
          Homeserver
        </Text>
        <ServerPicker
          server={server}
          serverList={serverList}
          allowCustomServer={allowCustomServer}
          onServerChange={onServerChange}
        />
      </Box>
    );
  }

  return (
    <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
      <Text size="T300" priority="300">
        Homeserver: <b>{server}</b>
      </Text>
      {canChange && (
        <Button
          type="button"
          variant="Secondary"
          fill="None"
          size="300"
          radii="300"
          onClick={() => setEditing(true)}
        >
          <Text as="span" size="B300">
            Change
          </Text>
        </Button>
      )}
    </Box>
  );
}

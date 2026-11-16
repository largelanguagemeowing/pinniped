import React from 'react';
import { Button, Text } from 'folds';
import { SettingTile } from '../../../components/setting-tile';
import { useDesktopUpdater } from '../../../hooks/useDesktopUpdater';
import { UpdateStatus } from '../../../utils/device';

const describe = (status: UpdateStatus): string => {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return `Downloading ${status.version} (${status.percent}%)…`;
    case 'current':
      return "You're on the latest version.";
    case 'ready':
      return `${status.version} is ready. It installs when Pinniped quits.`;
    case 'error':
      return `Could not check for updates: ${status.message}`;
    default:
      return 'Updates download in the background and install when Pinniped quits.';
  }
};

/** Only the desktop build that updates itself has one; everywhere else it renders nothing. */
export function UpdateCheck() {
  const { status, check, install } = useDesktopUpdater();
  if (status.state === 'unsupported') return null;

  const busy = status.state === 'checking' || status.state === 'downloading';

  return (
    <SettingTile
      title="Check for Updates"
      description={describe(status)}
      after={
        status.state === 'ready' ? (
          <Button onClick={install} variant="Success" fill="Soft" size="300" radii="300" outlined>
            <Text size="B300">Restart to Update</Text>
          </Button>
        ) : (
          <Button
            onClick={check}
            disabled={busy}
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            outlined
          >
            <Text size="B300">Check Now</Text>
          </Button>
        )
      }
    />
  );
}

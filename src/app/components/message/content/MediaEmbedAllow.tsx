import React from 'react';
import { Box, Button, Text, config } from 'folds';
import { settingsAtom } from '../../../state/settings';
import { useSetting } from '../../../state/hooks/settings';

type MediaEmbedAllowProps = {
  host: string;
};

/** Offers to add a bridge host to the Media Embeds list with one click. */
export function MediaEmbedAllow({ host }: MediaEmbedAllowProps) {
  const [hosts, setHosts] = useSetting(settingsAtom, 'mediaEmbedHosts');

  return (
    <Box alignItems="Center" gap="200" wrap="Wrap" style={{ marginTop: config.space.S200 }}>
      <Text size="T300" priority="300">
        Media from {host} is not embedded.
      </Text>
      <Button
        size="300"
        variant="Secondary"
        fill="Soft"
        radii="300"
        onClick={() => {
          if (!hosts.includes(host)) setHosts([...hosts, host]);
        }}
      >
        <Text size="B300">Allow {host}</Text>
      </Button>
    </Box>
  );
}

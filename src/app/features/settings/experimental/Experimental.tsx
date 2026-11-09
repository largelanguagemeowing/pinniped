import React, { FormEventHandler, useState } from 'react';
import { Box, Button, color, config, Icon, IconButton, Icons, Input, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { SequenceCardStyle } from '../styles.css';
import { DEFAULT_MEDIA_EMBED_HOSTS, normalizeEmbedHost } from '../../../utils/directGif';

const normalizePreviewServer = (value: string): string | undefined => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

function UrlPreviewServer() {
  const [server, setServer] = useSetting(settingsAtom, 'urlPreviewServer');
  const [token, setToken] = useSetting(settingsAtom, 'urlPreviewServerToken');
  const [serverInput, setServerInput] = useState(server);
  const [tokenInput, setTokenInput] = useState(token);

  const normalized = normalizePreviewServer(serverInput);
  const trimmedToken = tokenInput.trim();
  const valid = !!normalized && !!trimmedToken;
  const hasChanges = serverInput.trim() !== server || trimmedToken !== token;
  const enabled = !!server && !!token;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!normalized || !trimmedToken) return;
    setServer(normalized);
    setToken(trimmedToken);
    setServerInput(normalized);
    setTokenInput(trimmedToken);
  };

  const handleClear = () => {
    setServer('');
    setToken('');
    setServerInput('');
    setTokenInput('');
  };

  return (
    <SettingTile
      title="Url Preview Server"
      description={
        enabled
          ? `Link previews are fetched from ${server}. Every previewed link is sent to that server.`
          : 'Optional. Fetch link previews from another server with a preview token instead of your homeserver. Every previewed link is sent to that server.'
      }
    >
      <Box
        as="form"
        onSubmit={handleSubmit}
        direction="Column"
        gap="200"
        style={{ marginTop: config.space.S200 }}
      >
        <Box grow="Yes" direction="Column">
          <Input
            name="urlPreviewServerInput"
            value={serverInput}
            onChange={(evt) => setServerInput(evt.currentTarget.value)}
            placeholder="https://matrix.example.org"
            autoComplete="off"
            spellCheck={false}
            size="400"
            variant="Secondary"
            radii="300"
          />
        </Box>
        <Box gap="200">
          <Box grow="Yes" direction="Column">
            <Input
              name="urlPreviewServerTokenInput"
              type="password"
              value={tokenInput}
              onChange={(evt) => setTokenInput(evt.currentTarget.value)}
              placeholder="Preview token"
              autoComplete="off"
              spellCheck={false}
              size="400"
              variant="Secondary"
              radii="300"
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges && valid ? 'Success' : 'Secondary'}
            fill={hasChanges && valid ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || !valid}
            type="submit"
          >
            <Text size="B400">Save</Text>
          </Button>
          {enabled && (
            <Button
              size="400"
              variant="Critical"
              fill="Soft"
              outlined
              radii="300"
              type="button"
              onClick={handleClear}
            >
              <Text size="B400">Clear</Text>
            </Button>
          )}
        </Box>
        {serverInput.trim() && !normalized && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Enter an https:// server address.
          </Text>
        )}
      </Box>
    </SettingTile>
  );
}

function MediaEmbedHosts() {
  const [hosts, setHosts] = useSetting(settingsAtom, 'mediaEmbedHosts');
  const [input, setInput] = useState('');
  const normalized = normalizeEmbedHost(input);
  const duplicate = !!normalized && hosts.includes(normalized);
  const isDefault =
    hosts.length === DEFAULT_MEDIA_EMBED_HOSTS.length &&
    DEFAULT_MEDIA_EMBED_HOSTS.every((host) => hosts.includes(host));

  const handleAdd: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!normalized || duplicate) return;
    setHosts([...hosts, normalized]);
    setInput('');
  };

  return (
    <SettingTile
      title="Media Embeds"
      description="GIF and video links from these hosts are embedded in the timeline. Every other link is previewed through your homeserver or the preview server. Embedding loads the file from the host, so the host sees your IP address."
    >
      <Box direction="Column" gap="200" style={{ marginTop: config.space.S200 }}>
        {hosts.length === 0 && (
          <Text size="T300" priority="300">
            No hosts. Links are not embedded.
          </Text>
        )}
        {hosts.map((host) => (
          <Box key={host} alignItems="Center" gap="200">
            <Box grow="Yes" style={{ minWidth: 0 }}>
              <Text size="B400" truncate>
                {host}
              </Text>
            </Box>
            <IconButton
              onClick={() => setHosts(hosts.filter((h) => h !== host))}
              aria-label={`Remove ${host}`}
              variant="SurfaceVariant"
              size="300"
              radii="300"
            >
              <Icon src={Icons.Cross} size="100" />
            </IconButton>
          </Box>
        ))}
        <Box as="form" onSubmit={handleAdd} direction="Column" gap="200">
          <Box gap="200">
            <Box grow="Yes" direction="Column">
              <Input
                name="mediaEmbedHostInput"
                value={input}
                onChange={(evt) => setInput(evt.currentTarget.value)}
                placeholder="example.org"
                autoComplete="off"
                spellCheck={false}
                size="400"
                variant="Secondary"
                radii="300"
              />
            </Box>
            <Button
              size="400"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              disabled={!normalized || duplicate}
              type="submit"
            >
              <Text size="B400">Add</Text>
            </Button>
          </Box>
          {input.trim() && !normalized && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              Enter a host name, like example.org.
            </Text>
          )}
          {duplicate && (
            <Text size="T200" priority="300">
              Already in the list.
            </Text>
          )}
        </Box>
        {!isDefault && (
          <Box>
            <Button
              size="400"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              type="button"
              onClick={() => setHosts([...DEFAULT_MEDIA_EMBED_HOSTS])}
            >
              <Text size="B400">Reset to defaults</Text>
            </Button>
          </Box>
        )}
      </Box>
    </SettingTile>
  );
}

function MediaEmbeds() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Media Embeds</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <MediaEmbedHosts />
      </SequenceCard>
    </Box>
  );
}

function LinkPreviews() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Link Previews</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <UrlPreviewServer />
      </SequenceCard>
    </Box>
  );
}

type ExperimentalProps = {
  requestClose: () => void;
};
export function Experimental({ requestClose }: ExperimentalProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Experimental
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <MediaEmbeds />
              <LinkPreviews />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

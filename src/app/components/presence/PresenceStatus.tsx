import React from 'react';
import { Box, color, Icon, Icons, IconSrc, Text } from 'folds';
import { RichPresence } from '../../../types/matrix/richPresence';

type PresenceStatusProps = {
  // Custom status (m.presence status_msg). Wins over rich presence when set.
  status?: string;
  richPresence?: RichPresence;
  className?: string;
};

const richPresenceIcon = (rp: RichPresence): IconSrc =>
  rp.type === 'media' ? Icons.Headphone : Icons.Play;

const richPresenceLabel = (rp: RichPresence): string =>
  rp.type === 'media' ? `Listening to ${rp.track}` : `Playing ${rp.name}`;

/**
 * Secondary-line status slot. Rich presence fills the slot when no custom
 * status is set; when a custom status is set it wins and the rich-presence
 * icon prefixes it to signal the active activity.
 */
export function PresenceStatus({ status, richPresence, className }: PresenceStatusProps) {
  let icon: IconSrc | undefined;
  let text: string | undefined;

  if (status) {
    text = status;
    icon = richPresence ? richPresenceIcon(richPresence) : undefined;
  } else if (richPresence) {
    text = richPresenceLabel(richPresence);
    icon = richPresenceIcon(richPresence);
  }

  if (!text) return null;
  return (
    <Box as="span" className={className} alignItems="Center" gap="100" grow="Yes">
      {icon && (
        <Icon style={{ color: color.Success.Main, flexShrink: 0 }} src={icon} size="50" filled />
      )}
      <Text size="T200" priority="300" truncate title={text}>
        {text}
      </Text>
    </Box>
  );
}

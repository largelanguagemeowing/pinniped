import React from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import { AttachmentTamperedError, AttachmentUnreadableError } from '../../../utils/matrix';

/**
 * Explains why an attachment is not shown. Retry is offered only when trying again can help:
 * a network failure. A hash mismatch or an undecryptable attachment is final, so retrying would
 * show the same result. The tamper warning must not be hidden behind a generic error.
 */
export function AttachmentLoadError({
  error,
  onRetry,
  size = '400',
}: {
  error: unknown;
  onRetry: () => void;
  size?: '300' | '400';
}) {
  if (error instanceof AttachmentTamperedError || error instanceof AttachmentUnreadableError) {
    const message =
      error instanceof AttachmentTamperedError
        ? 'This attachment failed its integrity check. It may have been altered after it was sent, so it is not shown.'
        : "This attachment can't be decrypted.";
    return (
      <Box direction="Column" alignItems="Center" gap="200" role="alert">
        <Text size="B300" priority="400" align="Center">
          <Icon size="100" src={Icons.Warning} filled /> {message}
        </Text>
      </Box>
    );
  }

  return (
    <Button
      size={size}
      variant="Critical"
      fill="Soft"
      outlined
      radii="300"
      onClick={onRetry}
      before={<Icon size="100" src={Icons.Warning} filled />}
    >
      <Text size="B300" truncate>
        Failed to load. Retry
      </Text>
    </Button>
  );
}

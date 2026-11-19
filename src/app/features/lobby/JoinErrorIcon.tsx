import React from 'react';
import { Box, Icon, Icons, Text, Tooltip, TooltipProvider, color, toRem } from 'folds';
import { MatrixError } from 'matrix-js-sdk';

type JoinErrorIconProps = {
  error: MatrixError;
  /** Only when the icon sits outside any button; a focusable child breaks a parent button. */
  tabbable?: boolean;
};

/** Warning for a failed join, with the server's reason on hover; shared by channels and spaces. */
export function JoinErrorIcon({ error, tabbable }: JoinErrorIconProps) {
  const message = error.data?.error || error.message;

  return (
    <TooltipProvider
      tooltip={
        <Tooltip variant="Critical" style={{ maxWidth: toRem(200) }}>
          <Box direction="Column" gap="100">
            <Text style={{ wordBreak: 'break-word' }} size="T400">
              {message}
            </Text>
            <Text size="T200">{error.name}</Text>
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Icon
          ref={triggerRef}
          style={{ color: color.Critical.Main, cursor: 'pointer' }}
          src={Icons.Warning}
          size="400"
          filled
          tabIndex={tabbable ? 0 : undefined}
          aria-label={message}
        />
      )}
    </TooltipProvider>
  );
}

import React from 'react';
import { Box, Button, Text, color, config } from 'folds';
import { useRouteError } from 'react-router-dom';

// Replaces React Router's default error page, which prints a stack trace.
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Unknown error';

  return (
    <Box
      direction="Column"
      grow="Yes"
      alignItems="Center"
      justifyContent="Center"
      gap="300"
      style={{ padding: config.space.S400 }}
    >
      <Text size="H4">Something went wrong</Text>
      <Text size="T300" align="Center" style={{ color: color.Critical.Main }}>
        {message}
      </Text>
      <Button variant="Primary" onClick={() => window.location.reload()}>
        <Text as="span" size="B400">
          Reload
        </Text>
      </Button>
    </Box>
  );
}

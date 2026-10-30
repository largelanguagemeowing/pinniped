import React from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import * as css from './UnverifiedBanner.css';
import { gateNeedsVerification, reopenGate } from './deviceVerificationGate';
import { useVerificationGateState } from './useVerificationGateState';

/**
 * Stays visible after "Continue without verifying" so the choice is never silent, and puts
 * the verification step one click away.
 */
export function UnverifiedBanner() {
  const { userId, deviceId, crossSigningActive, status, dismissed } = useVerificationGateState();

  // While the gate is open it already says this, so the banner only covers the skipped case.
  const skipped =
    dismissed && gateNeedsVerification({ crossSigningActive, status, dismissed: false });
  if (!skipped) return null;

  return (
    <Box className={css.UnverifiedBanner} role="status">
      <Icon size="200" src={Icons.ShieldUser} />
      <Box grow="Yes">
        <Text size="T300">
          <b>This device is unverified.</b> Older messages stay locked and people you chat with see
          a warning.
        </Text>
      </Box>
      <Button
        variant="Warning"
        size="300"
        radii="300"
        onClick={() => deviceId && reopenGate(userId, deviceId)}
      >
        <Text as="span" size="B300">
          Verify now
        </Text>
      </Button>
    </Box>
  );
}

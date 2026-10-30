import {
  EventEncryptionInfo,
  EventShieldColour,
  EventShieldReason,
} from 'matrix-js-sdk/lib/crypto-api';

/** A warning to show next to a message whose sender could not be fully checked. */
export type MessageShield = {
  colour: 'red' | 'grey';
  text: string;
};

const REASON_TEXT: Partial<Record<EventShieldReason, string>> = {
  [EventShieldReason.UNSIGNED_DEVICE]:
    'Sent from a device its owner has not verified. If you do not recognize it, this may not be them.',
  [EventShieldReason.UNKNOWN_DEVICE]:
    'Sent from an unknown or deleted device, so it cannot be checked.',
  [EventShieldReason.VERIFICATION_VIOLATION]:
    'This person was verified before but has changed their identity. Verify them again before trusting this message.',
  [EventShieldReason.MISMATCHED_SENDER]:
    'The sender of this message does not match the device that encrypted it.',
  [EventShieldReason.AUTHENTICITY_NOT_GUARANTEED]:
    'Its key came from one of your devices or your encrypted backup, not from the sender, so the sender cannot be confirmed.',
  [EventShieldReason.UNVERIFIED_IDENTITY]: 'Sent by someone you have not verified.',
};

const UNKNOWN_REASON = 'The sender of this message could not be checked.';

/**
 * What the SDK says about a decrypted message's sender, as a warning. The SDK decides what is
 * worth a shield (an ordinary unverified contact is not), so this only words it.
 */
export const messageShield = (
  info: EventEncryptionInfo | null | undefined
): MessageShield | null => {
  if (!info || info.shieldColour === EventShieldColour.NONE) return null;

  const text =
    (info.shieldReason !== null ? REASON_TEXT[info.shieldReason] : undefined) ?? UNKNOWN_REASON;
  return { colour: info.shieldColour === EventShieldColour.RED ? 'red' : 'grey', text };
};

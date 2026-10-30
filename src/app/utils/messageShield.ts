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

// Every one of these can have an innocent cause, and every one can also be what a homeserver
// admin leaves behind: adding a device, adding and deleting one, resetting an identity,
// forging a sender, or adding keys to a backup that lives on the homeserver. The notes say so
// without accusing anyone.
const NOT_PRIVATE =
  'Do not treat this message as private or end-to-end encrypted. Ask them to verify their devices, and turn on Only verified devices in Settings.';

const REASON_TEXT: Partial<Record<EventShieldReason, string>> = {
  [EventShieldReason.UNSIGNED_DEVICE]: `This device is not trusted: its owner has not verified it. A homeserver admin could have added it. ${NOT_PRIVATE}`,
  [EventShieldReason.UNKNOWN_DEVICE]: `Sent from an unknown or deleted device. A homeserver admin could have added a device, sent this, and removed it. ${NOT_PRIVATE}`,
  [EventShieldReason.VERIFICATION_VIOLATION]:
    'This person was verified before but their identity has changed. A homeserver admin could have reset it. Verify them again before trusting this message, and do not treat it as private.',
  [EventShieldReason.MISMATCHED_SENDER]:
    'The sender of this message does not match the device that encrypted it. A homeserver admin could have forged it. Do not trust it.',
  [EventShieldReason.AUTHENTICITY_NOT_GUARANTEED]:
    'Its key came from one of your devices or your encrypted backup, not from the sender, so it is only as trustworthy as those. Your homeserver’s admin could have added keys to your backup.',
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

import { describe, expect, it } from 'vitest';
import { EventShieldColour, EventShieldReason } from 'matrix-js-sdk/lib/crypto-api';
import { messageShield } from '../../src/app/utils/messageShield';

const info = (shieldColour: EventShieldColour, shieldReason: EventShieldReason | null) => ({
  shieldColour,
  shieldReason,
});

describe('messageShield', () => {
  it('shows nothing when the SDK has no concern', () => {
    expect(messageShield(info(EventShieldColour.NONE, null))).toBeNull();
  });

  it('shows nothing when there is no encryption info (not encrypted, or not decrypted)', () => {
    expect(messageShield(null)).toBeNull();
    expect(messageShield(undefined)).toBeNull();
  });

  it('flags a device its owner has not verified, in red', () => {
    const shield = messageShield(info(EventShieldColour.RED, EventShieldReason.UNSIGNED_DEVICE));
    expect(shield?.colour).toBe('red');
    expect(shield?.text).toContain('device its owner has not verified');
  });

  it.each([
    [EventShieldReason.UNKNOWN_DEVICE, 'unknown or deleted device'],
    [EventShieldReason.VERIFICATION_VIOLATION, 'changed their identity'],
    [EventShieldReason.MISMATCHED_SENDER, 'does not match the device'],
  ])('words the red reason %s', (reason, snippet) => {
    const shield = messageShield(info(EventShieldColour.RED, reason));
    expect(shield?.colour).toBe('red');
    expect(shield?.text).toContain(snippet);
  });

  it('flags a forwarded or backed-up key in grey, since it is less serious', () => {
    const shield = messageShield(
      info(EventShieldColour.GREY, EventShieldReason.AUTHENTICITY_NOT_GUARANTEED)
    );
    expect(shield?.colour).toBe('grey');
    expect(shield?.text).toContain('Another device or your backup supplied it');
    expect(shield?.text).not.toMatch(/forward/i);
  });

  it('words an unverified identity, though the SDK does not currently raise it', () => {
    const shield = messageShield(
      info(EventShieldColour.RED, EventShieldReason.UNVERIFIED_IDENTITY)
    );
    expect(shield?.text).toContain('someone you have not verified');
  });

  it('still warns, in plain words, for a reason it has no wording for', () => {
    const shield = messageShield(info(EventShieldColour.RED, EventShieldReason.UNKNOWN));
    expect(shield?.colour).toBe('red');
    expect(shield?.text).toBe('The sender of this message could not be checked.');
    expect(messageShield(info(EventShieldColour.GREY, null))?.colour).toBe('grey');
  });
});

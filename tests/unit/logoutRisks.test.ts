import { describe, expect, it } from 'vitest';
import { logoutRisks, LogoutRiskInput } from '../../src/app/components/logoutRisks';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

// A device that is verified, backing up, fully uploaded, and has company.
const safe: LogoutRiskInput = {
  crossSigningActive: true,
  verification: VerificationStatus.Verified,
  backupActive: true,
  backupRemaining: 0,
  otherDevices: 2,
};

const ids = (input: Partial<LogoutRiskInput>) =>
  logoutRisks({ ...safe, ...input }).map((risk) => risk.id);

describe('logoutRisks', () => {
  it('has nothing to say when keys are safe and there are other devices', () => {
    expect(logoutRisks(safe)).toEqual([]);
  });

  it('warns when recovery is not set up', () => {
    expect(ids({ crossSigningActive: false })).toEqual(['noRecovery']);
  });

  it('warns when the device is unverified', () => {
    expect(ids({ verification: VerificationStatus.Unverified })).toEqual(['unverified']);
  });

  it('warns when a verified device has no active backup', () => {
    expect(ids({ backupActive: false })).toEqual(['notBackedUp']);
  });

  it('says how many keys are still uploading, and that it is only a warning', () => {
    const [risk] = logoutRisks({ ...safe, backupRemaining: 12 });
    expect(risk.id).toBe('backupInProgress');
    expect(risk.severity).toBe('Warning');
    expect(risk.description).toContain('12 message keys are still being backed up');
  });

  it('uses the singular for one key', () => {
    const [risk] = logoutRisks({ ...safe, backupRemaining: 1 });
    expect(risk.description).toContain('1 message key is still being backed up');
  });

  it('reports only the most serious key problem, not a pile of overlapping ones', () => {
    expect(
      ids({
        crossSigningActive: false,
        verification: VerificationStatus.Unverified,
        backupActive: false,
        backupRemaining: 5,
      })
    ).toEqual(['noRecovery']);
    expect(ids({ verification: VerificationStatus.Unverified, backupActive: false })).toEqual([
      'unverified',
    ]);
  });

  it('does not treat an unknown verification status as a problem', () => {
    expect(ids({ verification: VerificationStatus.Unknown })).toEqual([]);
  });

  describe('when this is the only device', () => {
    it('adds a warning that you will need the recovery key, if everything else is fine', () => {
      const risks = logoutRisks({ ...safe, otherDevices: 0 });
      expect(risks.map((risk) => risk.id)).toEqual(['onlyDevice']);
      expect(risks[0].severity).toBe('Warning');
      expect(risks[0].description).toContain('recovery key');
    });

    it('makes the card critical when any other risk applies, since nothing can recover it', () => {
      for (const input of [
        { crossSigningActive: false },
        { verification: VerificationStatus.Unverified },
        { backupActive: false },
        { backupRemaining: 3 },
      ]) {
        const risks = logoutRisks({ ...safe, ...input, otherDevices: 0 });
        expect(risks).toHaveLength(2);
        expect(risks[1].id).toBe('onlyDevice');
        expect(risks[1].severity).toBe('Critical');
        expect(risks[1].description).toContain('cannot be recovered');
      }
    });

    it('lists the only-device card last', () => {
      expect(ids({ backupActive: false, otherDevices: 0 })).toEqual(['notBackedUp', 'onlyDevice']);
    });
  });

  it('does not claim to be the only device before the device list has loaded', () => {
    expect(ids({ otherDevices: undefined })).toEqual([]);
  });
});

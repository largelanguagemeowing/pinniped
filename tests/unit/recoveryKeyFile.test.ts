import { describe, expect, it } from 'vitest';
import { recoveryKeyFilename } from '../../src/app/utils/recoveryKeyFile';

describe('recoveryKeyFilename', () => {
  it('names the file after the account', () => {
    expect(recoveryKeyFilename('@alice:matrix.org')).toBe(
      'pinniped-recovery-key-alice-matrix.org.txt'
    );
  });

  it('keeps keys for different accounts apart', () => {
    expect(recoveryKeyFilename('@alice:matrix.org')).not.toBe(
      recoveryKeyFilename('@alice:stablecat.club')
    );
    expect(recoveryKeyFilename('@alice:matrix.org')).not.toBe(
      recoveryKeyFilename('@bob:matrix.org')
    );
  });

  it('removes the colon of a server port, which Windows filenames cannot contain', () => {
    expect(recoveryKeyFilename('@alice:example.org:8448')).toBe(
      'pinniped-recovery-key-alice-example.org-8448.txt'
    );
  });

  it.each(['@we/ird=user+x:example.org', '@a:[::1]:8448', '@ünï:example.org'])(
    'only produces filesystem-safe characters for %s',
    (userId) => {
      expect(recoveryKeyFilename(userId)).toMatch(/^pinniped-recovery-key-[A-Za-z0-9._-]+\.txt$/);
    }
  );

  it('does not let a long account name make an unusable filename', () => {
    const name = recoveryKeyFilename(`@${'a'.repeat(300)}:example.org`);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name).toMatch(/^pinniped-recovery-key-a+\.txt$/);
  });

  it('falls back to a plain name when nothing usable remains', () => {
    expect(recoveryKeyFilename('')).toBe('pinniped-recovery-key.txt');
    expect(recoveryKeyFilename('@:::')).toBe('pinniped-recovery-key.txt');
  });

  it('always ends in .txt so it opens anywhere', () => {
    expect(recoveryKeyFilename('@alice:matrix.org').endsWith('.txt')).toBe(true);
  });
});

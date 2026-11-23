import { describe, expect, it, vi } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import { assertNoServerBackup, checkServerBackup } from '../../src/app/utils/serverBackup';

const client = (request: () => Promise<unknown>) =>
  ({ http: { authedRequest: vi.fn(request) } }) as unknown as MatrixClient;

const notFound = () => new MatrixError({ errcode: 'M_NOT_FOUND', error: 'No backup found' }, 404);

describe('checkServerBackup', () => {
  it('reports the backup the server has', async () => {
    const info = { version: '3', algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2' };

    expect(await checkServerBackup(client(async () => info))).toEqual({ status: 'present', info });
  });

  it('reports absent only for M_NOT_FOUND', async () => {
    expect(await checkServerBackup(client(async () => Promise.reject(notFound())))).toEqual({
      status: 'absent',
    });
  });

  it.each([
    ['a 500', new MatrixError({ errcode: 'M_UNKNOWN', error: 'oops' }, 500)],
    ['a 429', new MatrixError({ errcode: 'M_LIMIT_EXCEEDED' }, 429)],
    ['a 404 without M_NOT_FOUND (a proxy)', new MatrixError({ errcode: 'M_UNRECOGNIZED' }, 404)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('reports unknown for %s', async (_name, error) => {
    expect(await checkServerBackup(client(async () => Promise.reject(error)))).toEqual({
      status: 'unknown',
      error,
    });
  });
});

describe('assertNoServerBackup', () => {
  it('passes when the server has none', async () => {
    await expect(
      assertNoServerBackup(client(async () => Promise.reject(notFound())))
    ).resolves.toBe(undefined);
  });

  it('refuses when a backup exists', async () => {
    await expect(assertNoServerBackup(client(async () => ({ version: '1' })))).rejects.toThrow(
      /already exists/
    );
  });

  it('refuses when it cannot tell, instead of treating an error as no backup', async () => {
    await expect(
      assertNoServerBackup(client(async () => Promise.reject(new TypeError('Failed to fetch'))))
    ).rejects.toThrow(/Could not check.*Failed to fetch/);
  });
});

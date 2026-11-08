import { describe, expect, it } from 'vitest';
import { mediaAuthHeaders } from '../../src/app/utils/matrix';

const session = { baseUrl: 'https://matrix.example.org', accessToken: 'tok' };
const download = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc';

describe('mediaAuthHeaders', () => {
  it('authenticates media on the session homeserver', () => {
    expect(mediaAuthHeaders(download, session)).toEqual({ Authorization: 'Bearer tok' });
    expect(mediaAuthHeaders(download.replace('download', 'thumbnail'), session)).toEqual({
      Authorization: 'Bearer tok',
    });
  });

  it('never sends the token to another host', () => {
    expect(
      mediaAuthHeaders(download.replace('matrix.example.org', 'evil.example'), session)
    ).toEqual({});
    expect(mediaAuthHeaders(download.replace('https', 'http'), session)).toEqual({});
  });

  it('leaves non-media homeserver URLs and missing sessions alone', () => {
    expect(mediaAuthHeaders('https://matrix.example.org/_matrix/client/v3/sync', session)).toEqual(
      {}
    );
    expect(mediaAuthHeaders(download, undefined)).toEqual({});
    expect(mediaAuthHeaders('not a url', session)).toEqual({});
  });

  it('respects a base URL under a path', () => {
    const s = { baseUrl: 'https://example.org/synapse/', accessToken: 'tok' };
    expect(
      mediaAuthHeaders('https://example.org/synapse/_matrix/client/v1/media/download/a/b', s)
    ).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(
      mediaAuthHeaders('https://example.org/other/_matrix/client/v1/media/download/a/b', s)
    ).toEqual({});
  });
});

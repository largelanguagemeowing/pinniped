import { createClient } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import { mxcUrlToHttp } from '../../src/app/utils/matrix';
import { isMxcUrl } from '../../src/app/utils/mxc';

const mx = createClient({ baseUrl: 'https://matrix.example.org' });
const thumb = (mxc: string) =>
  mxcUrlToHttp(mx, mxc, true, 32, 32, 'scale', undefined, undefined, true);

describe('mxcUrlToHttp with animated', () => {
  it('asks the server for the animation', () => {
    expect(new URL(thumb('mxc://example.org/abc')!).searchParams.get('animated')).toBe('true');
  });

  // a reaction key is whatever a room member sent; isMxcUrl is looser than the SDK's check
  it('gives no URL, instead of throwing, for a key the SDK rejects', () => {
    const key = 'mxc://example.org/a$b';
    expect(isMxcUrl(key)).toBe(true);
    expect(thumb(key)).toBeNull();
  });
});

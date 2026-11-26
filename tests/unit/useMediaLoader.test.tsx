import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MediaLoader, useMediaLoader } from '../../src/app/hooks/useMediaLoader';
import { mediaBlobCache } from '../../src/app/utils/mediaBlobCache';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Download = {
  src: string;
  encrypted: boolean;
  signal: AbortSignal;
  finish: (blob: Blob) => void;
};
// the downloads the server was asked for; each waits for the test to finish it
const downloads = vi.hoisted(() => [] as Download[]);

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getSafeUserId: () => '@me:example.org' }),
}));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => true,
}));
vi.mock('../../src/app/utils/matrix', async (importOriginal) => {
  const download =
    (encrypted: boolean) =>
    (src: string, ...rest: unknown[]): Promise<Blob> =>
      new Promise((finish, fail) => {
        const { signal } = rest.at(-1) as { signal: AbortSignal };
        signal.addEventListener('abort', () => fail(signal.reason));
        downloads.push({ src, encrypted, signal, finish });
      });
  return {
    ...(await importOriginal<typeof import('../../src/app/utils/matrix')>()),
    mxcUrlToHttp: (_mx: unknown, url: string) =>
      url.startsWith('mxc://') ? `https://hs/${url.slice('mxc://'.length)}` : null,
    downloadMedia: download(false),
    downloadEncryptedMedia: download(true),
  };
});

const loaders = new Map<string, MediaLoader>();
let renderers: ReactTestRenderer[] = [];

type ProbeProps = {
  name: string;
  mxc: string;
  whenUnmounted: 'abandon' | 'finish';
  encInfo?: EncryptedAttachmentInfo;
};
function Probe({ name, mxc, whenUnmounted, encInfo }: ProbeProps) {
  loaders.set(name, useMediaLoader({ mxc, mimeType: 'image/png', encInfo }, whenUnmounted));
  return null;
}

const mount = (props: ProbeProps): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Probe {...props} />);
  });
  renderers.push(renderer);
  return renderer;
};
const unmount = (renderer: ReactTestRenderer) => act(() => renderer.unmount());

// starts a load whose outcome the test reads later
const load = (name: string) => {
  const outcome: { blob?: Blob; error?: unknown } = {};
  loaders
    .get(name)
    ?.load()
    .then(
      (blob) => {
        outcome.blob = blob;
      },
      (error: unknown) => {
        outcome.error = error;
      }
    );
  return outcome;
};
const started = (count: number) => vi.waitFor(() => expect(downloads).toHaveLength(count));

let media = 0;
const fresh = () => {
  media += 1;
  return `mxc://example.org/media${media}`;
};

afterEach(() => {
  act(() => renderers.forEach((renderer) => renderer.unmount()));
  renderers = [];
  downloads.length = 0;
  loaders.clear();
  mediaBlobCache.clear();
});

describe('useMediaLoader', () => {
  it('names the address the media is fetched from', () => {
    mount({ name: 'a', mxc: 'mxc://example.org/abc', whenUnmounted: 'abandon' });
    mount({ name: 'b', mxc: 'https://elsewhere.example/abc', whenUnmounted: 'abandon' });

    expect(loaders.get('a')?.httpUrl).toBe('https://hs/example.org/abc');
    expect(loaders.get('b')?.httpUrl).toBeNull();
  });

  it('loads an unencrypted attachment as it is and an encrypted one decrypted', async () => {
    mount({ name: 'plain', mxc: fresh(), whenUnmounted: 'finish' });
    mount({
      name: 'encrypted',
      mxc: fresh(),
      whenUnmounted: 'finish',
      encInfo: {} as EncryptedAttachmentInfo,
    });

    load('plain');
    await started(1);
    load('encrypted');
    await started(2);

    expect(downloads.map((download) => download.encrypted)).toEqual([false, true]);
    downloads.forEach((download) => download.finish(new Blob(['x'])));
  });

  it('stops the download of media that is only shown when its component goes', async () => {
    const renderer = mount({ name: 'a', mxc: fresh(), whenUnmounted: 'abandon' });
    const outcome = load('a');
    await started(1);

    unmount(renderer);

    expect(downloads[0].signal.aborted).toBe(true);
    await vi.waitFor(() => expect(outcome.error).toMatchObject({ name: 'AbortError' }));
  });

  it('keeps downloading while another component still shows the media', async () => {
    const mxc = fresh();
    const first = mount({ name: 'a', mxc, whenUnmounted: 'abandon' });
    mount({ name: 'b', mxc, whenUnmounted: 'abandon' });
    load('a');
    const outcome = load('b');
    await started(1);

    unmount(first);
    expect(downloads[0].signal.aborted).toBe(false);

    const blob = new Blob(['x']);
    downloads[0].finish(blob);
    await vi.waitFor(() => expect(outcome.blob).toBe(blob));
    expect(downloads).toHaveLength(1);
  });

  it('finishes a download that was asked for when its component goes', async () => {
    const renderer = mount({ name: 'a', mxc: fresh(), whenUnmounted: 'finish' });
    const outcome = load('a');
    await started(1);

    unmount(renderer);
    expect(downloads[0].signal.aborted).toBe(false);

    const blob = new Blob(['x']);
    downloads[0].finish(blob);
    await vi.waitFor(() => expect(outcome.blob).toBe(blob));
  });
});

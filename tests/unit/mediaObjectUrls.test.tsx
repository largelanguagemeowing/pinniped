// @vitest-environment jsdom
import React from 'react';
import FileSaver from 'file-saver';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { AudioContent } from '../../src/app/components/message/content/AudioContent';
import { ImageContent } from '../../src/app/components/message/content/ImageContent';
import { ThumbnailContent } from '../../src/app/components/message/content/ThumbnailContent';
import { VideoContent } from '../../src/app/components/message/content/VideoContent';
import { DownloadFile, ReadPdfFile } from '../../src/app/components/message/content/FileContent';
import { FileDownloadButton } from '../../src/app/components/message/FileHeader';
import { MediaLoadProgress } from '../../src/app/components/message/content/MediaLoadProgress';
import { mediaBlobCache } from '../../src/app/utils/mediaBlobCache';
import type { DownloadProgress } from '../../src/app/utils/mediaDownload';
import { resetBackoff } from '../../src/app/utils/requestBackoff';

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/components/message/content/style.css', anyStyle);
vi.mock('../../src/app/styles/Modal.css', anyStyle);
vi.mock('../../src/app/components/media', () => ({ StillImage: () => null }));
vi.mock('../../src/app/hooks/useHoverPlay', () => ({
  useHoverPlay: () => ({ lowAnimationMode: false, hovered: false, hoverProps: {} }),
}));

const client = vi.hoisted(() => ({ getSafeUserId: () => '@me:example.org' }));
// how many times media was fetched from the server; a stalled server leaves its requests
// waiting until they are answered by hand
const downloads = vi.hoisted(() => ({
  count: 0,
  stalled: false,
  waiting: [] as (() => void)[],
  answer: () => downloads.waiting.splice(0).forEach((answer) => answer()),
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => client }));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => true,
}));
// overlays portal into the document, which the test renderer cannot host
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: () => null,
}));
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }));
vi.mock('../../src/app/utils/matrix', async (importOriginal) => {
  const download =
    (content: string) =>
    async (...args: unknown[]): Promise<Blob> => {
      downloads.count += 1;
      if (!downloads.stalled) return new Blob([content]);
      // a quarter arrives, then nothing more
      const { signal, onProgress } = args.at(-1) as {
        signal: AbortSignal;
        onProgress: (progress: DownloadProgress) => void;
      };
      onProgress({ length: 'known', loaded: 1, total: 4 });
      return new Promise((answer, fail) => {
        signal.addEventListener('abort', () => fail(signal.reason));
        downloads.waiting.push(() => answer(new Blob([content])));
      });
    };
  return {
    ...(await importOriginal<typeof import('../../src/app/utils/matrix')>()),
    mxcUrlToHttp: (_mx: unknown, url: string) => `https://hs/${url}`,
    downloadMedia: download('media'),
    downloadEncryptedMedia: download('decrypted'),
    decryptFile: async () => new Blob(['decrypted']),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const encInfo = {} as EncryptedAttachmentInfo;
const mxc = 'mxc://example.org/file';

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;
let renderer: ReactTestRenderer;
let mounted = false;

beforeEach(() => {
  live.clear();
  created = 0;
  downloads.count = 0;
  downloads.stalled = false;
  downloads.waiting = [];
  vi.mocked(FileSaver.saveAs).mockClear();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      created += 1;
      const url = `blob:test/${created}`;
      live.add(url);
      return url;
    },
    revokeObjectURL: (url: string) => live.delete(url),
  });
});

afterEach(() => {
  // a test that failed midway must not leave its media held for the next one
  if (mounted) act(() => renderer.unmount());
  mounted = false;
  mediaBlobCache.clear();
  resetBackoff();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

// A load ends some turns after it starts. Waits for what it leaves behind, one turn at a time:
// React applies what a turn changed when its `act` ends, so one long `act` would never see it.
const until = async (check: () => void) => {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    await flush();
  }
};
const untilShown = () => until(() => expect(created).toBeGreaterThan(0));

const mount = async (element: React.ReactElement) => {
  await act(async () => {
    renderer = create(element);
  });
  mounted = true;
  await flush();
};

const unmount = () => {
  mounted = false;
  return act(() => renderer.unmount());
};

// Loaded media stays in the media cache for the next time it is shown, and its URL with it. Once
// the component is gone nothing else may have one: the cache uses nothing, and evicting what it
// keeps leaves no URL.
const expectNoneLeft = () => {
  expect(mediaBlobCache.usage().inUse).toBe(0);
  mediaBlobCache.clear();
  expect(live.size).toBe(0);
};

describe('blob URLs of loaded media', () => {
  const cases: [string, () => React.ReactElement, boolean][] = [
    [
      'audio',
      () => (
        <AudioContent
          mimeType="audio/ogg"
          url={mxc}
          info={{}}
          waveform={[1, 2, 3]}
          renderMediaControl={() => null}
        />
      ),
      false,
    ],
    [
      'video',
      () => (
        <VideoContent
          body="clip"
          mimeType="video/mp4"
          url={mxc}
          info={{}}
          renderVideo={({ src }) => <video src={src} />}
        />
      ),
      true,
    ],
    [
      'encrypted image',
      () => (
        <ImageContent
          body="pic"
          mimeType="image/png"
          url={mxc}
          encInfo={encInfo}
          renderViewer={() => null}
          renderImage={(props) => <img alt={props.alt} src={props.src} />}
        />
      ),
      true,
    ],
    [
      'encrypted thumbnail',
      () => (
        <ThumbnailContent
          info={{
            thumbnail_url: mxc,
            thumbnail_file: { ...encInfo, url: mxc } as never,
            thumbnail_info: { mimetype: 'image/png' },
          }}
          renderImage={(src) => <img alt="thumb" src={src} />}
        />
      ),
      true,
    ],
  ];

  it.each(cases)('%s: none is left once the component is gone', async (_name, element, auto) => {
    await mount(element());
    if (!auto) {
      const buttons = renderer.root.findAll((node) => typeof node.props.onClick === 'function');
      await act(async () => buttons[0].props.onClick());
    }
    await untilShown();

    await unmount();

    expectNoneLeft();
  });

  it('a PDF: none is left once the component is gone', async () => {
    await mount(
      <ReadPdfFile
        body="doc.pdf"
        mimeType="application/pdf"
        url={mxc}
        renderViewer={({ src }) => <div>{src}</div>}
      />
    );
    const buttons = renderer.root.findAll((node) => typeof node.props.onClick === 'function');
    await act(async () => buttons[0].props.onClick());
    await untilShown();

    await unmount();

    expectNoneLeft();
  });

  it('a retry that replaces an image keeps no copy of the old one', async () => {
    await mount(
      <ImageContent
        body="pic"
        mimeType="image/png"
        url={mxc}
        encInfo={encInfo}
        renderViewer={() => null}
        renderImage={(props) => <img alt={props.alt} src={props.src} onError={props.onError} />}
      />
    );
    await untilShown();
    const img = () => renderer.root.findByType('img');
    const first = img().props.src;
    // a failed <img> load retries after a second, which loads (and decrypts) it again
    vi.useFakeTimers();
    await act(async () => img().props.onError());
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    vi.useRealTimers();
    await until(() => expect(created).toBe(2));

    expect(img().props.src).not.toBe(first);
    expect([...live]).toEqual([img().props.src]);
    expect(downloads.count).toBe(2);

    await unmount();
    expectNoneLeft();
  });

  it.each([
    ['a downloaded file', () => <DownloadFile body="a.bin" mimeType="x/y" url={mxc} info={{}} />],
    [
      'a downloaded attachment',
      () => <FileDownloadButton filename="a.bin" mimeType="x/y" url={mxc} />,
    ],
  ])('%s keeps no object URL once saved', async (_name, element) => {
    await mount(element());
    const buttons = renderer.root.findAll((node) => typeof node.props.onClick === 'function');
    await act(async () => buttons[0].props.onClick());
    await until(() => expect(FileSaver.saveAs).toHaveBeenCalled());

    await unmount();

    expectNoneLeft();
  });
});

describe('media shown again', () => {
  const image = () => (
    <ImageContent
      body="pic"
      mimeType="image/png"
      url={mxc}
      encInfo={encInfo}
      renderViewer={() => null}
      renderImage={(props) => <img alt={props.alt} src={props.src} />}
    />
  );
  const shown = () => renderer.root.findByType('img').props.src;

  it('is neither downloaded nor given a URL a second time', async () => {
    await mount(image());
    await untilShown();
    const first = shown();
    await unmount();

    await mount(image());
    await until(() => expect(shown()).toBe(first));

    expect(downloads.count).toBe(1);
    expect(created).toBe(1);
    await unmount();
    expectNoneLeft();
  });

  it('keeps its URL while it is shown, whatever the cache evicts', async () => {
    await mount(image());
    await untilShown();

    mediaBlobCache.clear();

    expect(live.has(shown())).toBe(true);
    await unmount();
    expectNoneLeft();
  });

  it('loads when it comes back after it was left while it loaded', async () => {
    downloads.stalled = true;
    await mount(image());
    await until(() => expect(downloads.count).toBe(1));
    await unmount();
    expect(mediaBlobCache.usage().inUse).toBe(0);

    // leaving is not a failure: the image is not kept from loading for a while
    downloads.stalled = false;
    await mount(image());
    await untilShown();

    expect(downloads.count).toBe(2);
    await unmount();
    expectNoneLeft();
  });

  it('is downloaded again by Retry after its element failed to play it', async () => {
    await mount(
      <VideoContent
        body="clip"
        mimeType="video/mp4"
        url={mxc}
        info={{}}
        renderVideo={({ src, onError }) => (
          <video src={src} onError={onError}>
            <track kind="captions" />
          </video>
        )}
      />
    );
    await untilShown();
    const video = () => renderer.root.findByType('video');
    const first = video().props.src;

    await act(async () => video().props.onError());
    const retry = renderer.root.findAll(
      (node) => typeof node.type === 'string' && typeof node.props.onClick === 'function'
    );
    await act(async () => retry[0].props.onClick());
    await until(() => expect(created).toBe(2));

    expect(video().props.src).not.toBe(first);
    expect([...live]).toEqual([video().props.src]);
    expect(downloads.count).toBe(2);
    await unmount();
    expectNoneLeft();
  });
});

describe('media that is downloading', () => {
  // whether the component says how far the download is
  const showsProgress = () =>
    renderer.root.findAllByType(MediaLoadProgress).some((label) => label.children.length > 0);

  it.each<[string, () => React.ReactElement, boolean]>([
    [
      'an encrypted image',
      () => (
        <ImageContent
          body="pic"
          mimeType="image/png"
          url={mxc}
          encInfo={encInfo}
          renderViewer={() => null}
          renderImage={(props) => <img alt={props.alt} src={props.src} />}
        />
      ),
      true,
    ],
    [
      'a video',
      () => (
        <VideoContent
          body="clip"
          mimeType="video/mp4"
          url={mxc}
          info={{}}
          renderVideo={() => null}
        />
      ),
      true,
    ],
    ['a file', () => <DownloadFile body="a.bin" mimeType="x/y" url={mxc} info={{}} />, false],
    [
      'a PDF',
      () => (
        <ReadPdfFile
          body="doc.pdf"
          mimeType="application/pdf"
          url={mxc}
          renderViewer={() => null}
        />
      ),
      false,
    ],
  ])('%s says how far it is, until it has arrived', async (_name, element, auto) => {
    downloads.stalled = true;
    await mount(element());
    if (!auto) {
      expect(showsProgress()).toBe(false);
      const buttons = renderer.root.findAll((node) => typeof node.props.onClick === 'function');
      await act(async () => buttons[0].props.onClick());
    }

    await until(() => expect(showsProgress()).toBe(true));

    downloads.answer();
    await until(() => expect(showsProgress()).toBe(false));

    await unmount();
    expectNoneLeft();
  });
});

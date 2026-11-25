// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { AudioContent } from '../../src/app/components/message/content/AudioContent';
import { ImageContent } from '../../src/app/components/message/content/ImageContent';
import { ThumbnailContent } from '../../src/app/components/message/content/ThumbnailContent';
import { VideoContent } from '../../src/app/components/message/content/VideoContent';
import { DownloadFile, ReadPdfFile } from '../../src/app/components/message/content/FileContent';
import { FileDownloadButton } from '../../src/app/components/message/FileHeader';

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

const client = vi.hoisted(() => ({}));
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
vi.mock('../../src/app/utils/matrix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/utils/matrix')>()),
  mxcUrlToHttp: (_mx: unknown, url: string) => `https://hs/${url}`,
  downloadMedia: async () => new Blob(['media']),
  downloadEncryptedMedia: async () => new Blob(['decrypted']),
  decryptFile: async () => new Blob(['decrypted']),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const encInfo = {} as EncryptedAttachmentInfo;
const mxc = 'mxc://example.org/file';

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;
let renderer: ReactTestRenderer;

beforeEach(() => {
  live.clear();
  created = 0;
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
  vi.unstubAllGlobals();
});

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

const mount = async (element: React.ReactElement) => {
  await act(async () => {
    renderer = create(element);
  });
  await flush();
};

const unmount = () => act(() => renderer.unmount());

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
      await flush();
    }
    expect(created).toBeGreaterThan(0);

    await unmount();

    expect(live.size).toBe(0);
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
    await flush();
    expect(created).toBeGreaterThan(0);

    await unmount();

    expect(live.size).toBe(0);
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
    const img = () => renderer.root.findByType('img');
    const first = img().props.src;
    // a failed <img> load retries after a second, which loads (and decrypts) it again
    vi.useFakeTimers();
    await act(async () => img().props.onError());
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    vi.useRealTimers();
    await flush();

    expect(img().props.src).not.toBe(first);
    expect([...live]).toEqual([img().props.src]);
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
    await flush();

    await unmount();

    expect(live.size).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { getImageMsgContent, getVideoMsgContent } from '../../src/app/features/room/msgContent';
import { loadImageElement, loadVideoElement, getThumbnail } from '../../src/app/utils/dom';
import type { TUploadItem } from '../../src/app/state/room/roomInputDrafts';

vi.mock('../../src/app/utils/dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/utils/dom')>()),
  loadImageElement: vi.fn(),
  loadVideoElement: vi.fn(),
  getThumbnail: vi.fn(),
}));
vi.mock('../../src/app/utils/matrix', () => ({
  encryptFile: vi.fn(),
  getImageInfo: () => ({}),
  getVideoInfo: () => ({}),
  getThumbnailContent: () => ({}),
}));
vi.mock('../../src/app/utils/blurHash', () => ({ encodeBlurHash: () => 'hash' }));
vi.mock('../../src/app/utils/animatedImage', () => ({
  animationInfo: () => ({}),
  detectImageAnimation: async () => undefined,
}));

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;

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
  vi.mocked(getThumbnail).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const file = new File(['x'], 'a.bin');
const item = {
  file,
  originalFile: file,
  metadata: { markedAsSpoiler: false },
  encInfo: undefined,
} as unknown as TUploadItem;
const mx = {} as MatrixClient;

describe('object URLs of sent media', () => {
  it.each([
    ['an image', () => getImageMsgContent(mx, item, 'mxc://hs/a'), loadImageElement],
    ['a video', () => getVideoMsgContent(mx, item, 'mxc://hs/a'), loadVideoElement],
  ] as const)(
    '%s: the one made to read its size is revoked after sending',
    async (_name, build, load) => {
      vi.mocked(load).mockResolvedValue({
        width: 1,
        height: 1,
        videoWidth: 1,
        videoHeight: 1,
      } as never);

      await build();

      expect(created).toBe(1);
      expect(live.size).toBe(0);
    }
  );

  it.each([
    ['an image', () => getImageMsgContent(mx, item, 'mxc://hs/a'), loadImageElement],
    ['a video', () => getVideoMsgContent(mx, item, 'mxc://hs/a'), loadVideoElement],
  ] as const)(
    '%s: it is revoked when the file cannot be read as well',
    async (_name, build, load) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.mocked(load).mockRejectedValue(new Error('cannot decode'));

      await build();

      expect(created).toBe(1);
      expect(live.size).toBe(0);
    }
  );
});

// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatrixEvent } from 'matrix-js-sdk';
import { Button, Chip } from 'folds';
import { ImageTile } from '../../src/app/components/image-pack-view/ImageTile';
import { ImagePackContent } from '../../src/app/components/image-pack-view/ImagePackContent';
import { ImagePack, PackContent } from '../../src/app/plugins/custom-emoji';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/components/image-pack-view/style.css', anyStyle);
vi.mock('../../src/app/components/upload-card/UploadCard.css', anyStyle);
vi.mock('../../src/app/styles/CustomHtml.css', anyStyle);
vi.mock('../../src/app/styles/Text.css', anyStyle);
vi.mock('../../src/app/components/sequence-card/style.css', anyStyle);
vi.mock('../../src/app/styles/ContainerColor.css', anyStyle);

// the upload card is what reports a finished upload
const upload = vi.hoisted(() => ({
  picked: new File(['x'], 'new.png', { type: 'image/png' }),
  onComplete: undefined as undefined | ((data: { file: File; mxc: string }) => Promise<void>),
}));
vi.mock('../../src/app/components/upload-card', () => ({
  CompactUploadCardRenderer: (props: { onComplete: typeof upload.onComplete }) => {
    upload.onComplete = props.onComplete;
    return null;
  },
}));
vi.mock('../../src/app/utils/dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/utils/dom')>()),
  selectFile: async () => [upload.picked],
  loadImageElement: async () => ({ width: 8, height: 8 }),
}));
vi.mock('../../src/app/utils/animatedImage', () => ({
  animationInfo: () => ({}),
  detectImageAnimation: async () => undefined,
}));

const client = vi.hoisted(() => ({ mxcUrlToHttp: () => 'https://hs/img' }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => client }));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => true,
}));

const pack = ImagePack.fromMatrixEvent(
  'pack',
  new MatrixEvent({
    type: 'm.room.image_pack',
    state_key: '',
    room_id: '!r:hs',
    event_id: '$pack',
    sender: '@a:hs',
    content: {
      pack: { display_name: 'Cats' },
      images: { cat: { url: 'mxc://hs/cat' }, dog: { url: 'mxc://hs/dog' } },
    },
  })
);

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;
let renderer: ReactTestRenderer;
let finishUpdate: () => void;
const onUpdate = vi.fn<(content: PackContent) => Promise<void>>();

const text = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === 'string' ? c : text(c as never))).join('');
const buttonLabelled = (label: string) =>
  renderer.root.findAllByType(Button).find((b) => text(b as never) === label)!;
// the controls of the image tiles, which delete and edit an image
const tileChips = () =>
  renderer.root.findAllByType(ImageTile).flatMap((tile) => tile.findAllByType(Chip));

beforeEach(async () => {
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
  onUpdate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishUpdate = resolve;
      })
  );
  await act(async () => {
    renderer = create(<ImagePackContent imagePack={pack} canEdit onUpdate={onUpdate} />);
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe('ImagePackContent while changes are applied', () => {
  it('lets an image be edited or deleted before applying', () => {
    expect(tileChips()).toHaveLength(4);
  });

  it('takes no edits while the request is running, so none is dropped when it finishes', async () => {
    // delete the first image, which offers the changes for applying
    await act(async () => {
      tileChips()[0].props.onClick();
    });
    // the request stays open, so the act must not wait for it
    await act(async () => {
      buttonLabelled('Apply Changes').props.onClick();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    expect(tileChips()).toHaveLength(0);
    expect(buttonLabelled('Select').props.disabled).toBe(true);

    await act(async () => finishUpdate());

    expect(tileChips()).toHaveLength(4);
    expect(buttonLabelled('Select').props.disabled).toBeFalsy();
  });
});

describe('ImagePackContent uploads', () => {
  it('keeps no object URL of an uploaded image once it is added', async () => {
    await act(async () => {
      buttonLabelled('Select').props.onClick();
    });
    expect(upload.onComplete).toBeDefined();

    await act(async () => upload.onComplete!({ file: upload.picked, mxc: 'mxc://hs/new' }));

    expect(renderer.root.findAllByType(ImageTile).length).toBe(3);
    expect(live.size).toBe(0);
  });
});

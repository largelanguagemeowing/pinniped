// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerTiles } from '../../src/app/components/upload-card';
import {
  ComposerTileStatus,
  TComposerTile,
  createTileId,
} from '../../src/app/state/room/composerTiles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/components/upload-card/UploadCard.css', anyStyle);

vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));

type FakeUpload = {
  file: File;
  succeed: (mxc: string) => void;
  fail: (message: string) => void;
};
const uploads = vi.hoisted(() => ({ started: [] as FakeUpload[] }));
vi.mock('../../src/app/utils/matrix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/utils/matrix')>()),
  uploadContent: async (
    _mx: unknown,
    file: File,
    options: {
      onPromise?: (p: Promise<unknown>) => void;
      onSuccess: (mxc: string) => void;
      onError: (e: unknown) => void;
    }
  ) => {
    options.onPromise?.(new Promise(() => undefined));
    uploads.started.push({
      file,
      succeed: options.onSuccess,
      fail: (message) => options.onError({ message }),
    });
  },
}));

// a tile that starts showing another file than it was created for was reused by index
const rebound = vi.hoisted(() => [] as string[]);
vi.mock('../../src/app/state/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/state/upload')>();
  const { useRef } = await import('react');
  return {
    ...actual,
    useBindUploadAtom: (...args: Parameters<typeof actual.useBindUploadAtom>) => {
      const bound = actual.useBindUploadAtom(...args);
      const first = useRef(bound.upload.file);
      if (first.current !== bound.upload.file) rebound.push(bound.upload.file.name);
      return bound;
    },
  };
});

const readyTile = (name: string): TComposerTile => {
  const file = new File(['x'], name, { type: 'text/plain' });
  return {
    id: createTileId(),
    status: ComposerTileStatus.Ready,
    item: {
      file,
      originalFile: file,
      encInfo: undefined,
      metadata: { markedAsSpoiler: false },
    },
  };
};

let removeTile: (tile: TComposerTile) => void = () => undefined;
function Host({ initial }: { initial: TComposerTile[] }) {
  const [tiles, setTiles] = useState(initial);
  removeTile = (tile) => setTiles((current) => current.filter((t) => t !== tile));
  return <ComposerTiles tiles={tiles} setMetadata={() => undefined} onRemove={removeTile} />;
}

const mounted: ReactTestRenderer[] = [];
const store = createStore();
const mount = (tiles: TComposerTile[]): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={store}>
        <Host initial={tiles} />
      </Provider>
    );
  });
  mounted.push(renderer);
  return renderer;
};

const buttons = (renderer: ReactTestRenderer, label: string): ReactTestInstance[] =>
  renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === label);

const startedNames = () => uploads.started.map((u) => u.file.name);

beforeEach(() => {
  uploads.started.length = 0;
  rebound.length = 0;
});

afterEach(() => {
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
});

describe('ComposerTiles', () => {
  it('keeps each tile bound to its own file when another tile is removed', () => {
    const tiles = [readyTile('a'), readyTile('b'), readyTile('c')];
    const renderer = mount(tiles);
    expect(startedNames().sort()).toEqual(['a', 'b', 'c']);

    act(() => {
      removeTile(tiles[2]);
    });
    expect(rebound).toEqual([]);
    expect(startedNames().sort()).toEqual(['a', 'b', 'c']);
    expect(buttons(renderer, 'Remove File')).toHaveLength(2);
  });

  it('keeps an upload that failed retryable and removable', () => {
    const tiles = [readyTile('a'), readyTile('b')];
    const renderer = mount(tiles);
    const failing = uploads.started.find((u) => u.file.name === 'a')!;

    act(() => {
      failing.fail('connection lost');
    });
    const retry = buttons(renderer, 'Retry Upload');
    expect(retry).toHaveLength(1);
    expect(buttons(renderer, 'Remove File')).toHaveLength(2);

    act(() => {
      retry[0].props.onClick();
    });
    // only the failed file starts again
    expect(startedNames().sort()).toEqual(['a', 'a', 'b']);
  });

  it('offers no retry for a file that never reached an upload, but still a removal', () => {
    const tiles: TComposerTile[] = [
      {
        id: createTileId(),
        status: ComposerTileStatus.Failed,
        name: 'big.bin',
        size: 11,
        failure: { kind: 'too-large', size: 11, limit: 10 },
      },
      {
        id: createTileId(),
        status: ComposerTileStatus.Preparing,
        name: 'slow.bin',
        size: 5,
        encrypting: true,
      },
    ];
    const renderer = mount(tiles);
    expect(uploads.started).toHaveLength(0);
    expect(buttons(renderer, 'Retry Upload')).toHaveLength(0);
    expect(buttons(renderer, 'Remove File')).toHaveLength(2);
    expect(renderer.root.findAll((node) => node.props.role === 'alert')).not.toHaveLength(0);
  });
});

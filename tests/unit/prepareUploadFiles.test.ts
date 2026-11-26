import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareUploadFiles } from '../../src/app/features/room/prepareUploadFiles';
import { ComposerTileStatus, TComposerTile } from '../../src/app/state/room/composerTiles';

const mocks = vi.hoisted(() => ({
  strip: vi.fn(async (f: File) => f),
  encrypt: vi.fn(async (f: File) => ({
    encInfo: { v: 'v2' } as never,
    file: new File(['enc'], f.name, { type: f.type }),
    originalFile: f,
  })),
}));
vi.mock('../../src/app/utils/stripMetadata', () => ({ stripMetadata: mocks.strip }));
vi.mock('../../src/app/utils/matrix', () => ({ encryptFile: mocks.encrypt }));

const file = (name: string, size = 3) => new File(['x'.repeat(size)], name, { type: 'text/plain' });

/** A composer list that applies puts and replacements the way the list atom does. */
const fakeList = () => {
  const tiles: TComposerTile[] = [];
  const history: TComposerTile[][] = [];
  return {
    tiles,
    history,
    put: (put: TComposerTile[]) => {
      tiles.push(...put);
      history.push([...tiles]);
    },
    replace: (from: TComposerTile, to: TComposerTile) => {
      const index = tiles.indexOf(from);
      if (index >= 0) tiles[index] = to;
      history.push([...tiles]);
    },
  };
};

beforeEach(() => {
  mocks.strip.mockClear();
  mocks.encrypt.mockClear();
});

describe('prepareUploadFiles', () => {
  it('shows one tile per file before any file is prepared', async () => {
    const list = fakeList();
    let release: () => void = () => undefined;
    mocks.strip.mockImplementationOnce(
      (f: File) =>
        new Promise<File>((resolve) => {
          release = () => resolve(f);
        })
    );
    const done = prepareUploadFiles(
      [file('a'), file('b')],
      { encrypt: true, limit: undefined },
      list
    );
    await Promise.resolve();
    expect(list.tiles.map((t) => t.status)).toEqual([
      ComposerTileStatus.Preparing,
      ComposerTileStatus.Preparing,
    ]);
    release();
    await done;
    expect(list.tiles.map((t) => t.status)).toEqual([
      ComposerTileStatus.Ready,
      ComposerTileStatus.Ready,
    ]);
  });

  it('keeps a tile id from placeholder to result', async () => {
    const list = fakeList();
    await prepareUploadFiles([file('a'), file('b')], { encrypt: false, limit: undefined }, list);
    const [placeholders] = list.history;
    const last = list.history[list.history.length - 1];
    expect(last.map((t) => t.id)).toEqual(placeholders.map((t) => t.id));
  });

  it('encrypts only in encrypted rooms and keeps the original file', async () => {
    const plain = fakeList();
    await prepareUploadFiles([file('a')], { encrypt: false, limit: undefined }, plain);
    expect(mocks.encrypt).not.toHaveBeenCalled();

    const encrypted = fakeList();
    await prepareUploadFiles([file('a')], { encrypt: true, limit: undefined }, encrypted);
    const [tile] = encrypted.tiles;
    expect(tile.status).toBe(ComposerTileStatus.Ready);
    if (tile.status === ComposerTileStatus.Ready) {
      expect(tile.item.encInfo).toBeDefined();
      expect(tile.item.originalFile.name).toBe('a');
    }
  });

  it('fails only the file whose preparation throws, naming it', async () => {
    mocks.encrypt.mockRejectedValueOnce(new Error('out of memory'));
    const list = fakeList();
    await prepareUploadFiles(
      [file('a'), file('b'), file('c')],
      { encrypt: true, limit: undefined },
      list
    );
    expect(list.tiles.map((t) => t.status)).toEqual([
      ComposerTileStatus.Failed,
      ComposerTileStatus.Ready,
      ComposerTileStatus.Ready,
    ]);
    expect(list.tiles[0]).toMatchObject({
      name: 'a',
      failure: { kind: 'prepare', message: 'out of memory' },
    });
  });

  it('rejects a file over the limit without reading it', async () => {
    const list = fakeList();
    await prepareUploadFiles(
      [file('big', 11), file('small', 10)],
      { encrypt: true, limit: 10 },
      list
    );
    expect(list.tiles[0]).toMatchObject({
      status: ComposerTileStatus.Failed,
      name: 'big',
      failure: { kind: 'too-large', size: 11, limit: 10 },
    });
    // a file exactly at the limit is accepted
    expect(list.tiles[1].status).toBe(ComposerTileStatus.Ready);
    expect(mocks.encrypt).toHaveBeenCalledTimes(1);
    expect(mocks.strip).toHaveBeenCalledTimes(1);
  });

  it('drops the result of a tile removed while it was prepared', async () => {
    const list = fakeList();
    mocks.strip.mockImplementationOnce(async (f: File) => {
      list.tiles.splice(0, 1);
      return f;
    });
    await prepareUploadFiles([file('a'), file('b')], { encrypt: false, limit: undefined }, list);
    expect(list.tiles).toHaveLength(1);
    expect(list.tiles[0]).toMatchObject({ status: ComposerTileStatus.Ready });
  });
});

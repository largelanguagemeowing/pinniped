import { describe, expect, it } from 'vitest';
import { IContent } from 'matrix-js-sdk';
import {
  buildUploadContents,
  describeLeftBehind,
  getLeftBehind,
} from '../../src/app/features/room/sendUploads';
import {
  ComposerTileStatus,
  ReadyTile,
  TComposerTile,
  createTileId,
} from '../../src/app/state/room/composerTiles';
import { Upload, UploadStatus } from '../../src/app/state/upload';

const ready = (name: string): ReadyTile => {
  const file = new File(['x'], name);
  return {
    id: createTileId(),
    status: ComposerTileStatus.Ready,
    item: { file, originalFile: file, encInfo: undefined, metadata: { markedAsSpoiler: false } },
  };
};
const success = (tile: ReadyTile): Upload => ({
  file: tile.item.file,
  status: UploadStatus.Success,
  mxc: `mxc://hs/${tile.item.file.name}`,
});
const failedTile = (name: string): TComposerTile => ({
  id: createTileId(),
  status: ComposerTileStatus.Failed,
  name,
  size: 1,
  failure: { kind: 'prepare', message: 'x' },
});

const build = async (item: { file: File }, mxc: string): Promise<IContent> => ({
  body: item.file.name,
  url: mxc,
});

describe('buildUploadContents', () => {
  it('builds one content per uploaded file in tile order', async () => {
    const [a, b, c] = [ready('a'), ready('b'), ready('c')];
    const { built, failed } = await buildUploadContents(
      [c, a, b].map(success) as never,
      [a, b, c],
      build
    );
    expect(failed).toEqual([]);
    expect(built.map((entry) => entry.content.body)).toEqual(['a', 'b', 'c']);
    expect(built.map((entry) => entry.tile)).toEqual([a, b, c]);
  });

  it('reports a file whose content cannot be built, by name, and still builds the others', async () => {
    const [a, b] = [ready('a'), ready('b')];
    const { built, failed } = await buildUploadContents(
      [a, b].map(success) as never,
      [a, b],
      async (item, mxc) => {
        if (item.file.name === 'a') throw new Error('cannot decode');
        return build(item, mxc);
      }
    );
    expect(built.map((entry) => entry.tile)).toEqual([b]);
    expect(failed).toEqual([{ tile: a, name: 'a', message: 'cannot decode' }]);
  });

  it('reports an upload that has no tile instead of dropping it', async () => {
    const orphan = ready('orphan');
    const { built, failed } = await buildUploadContents([success(orphan)] as never, [], build);
    expect(built).toEqual([]);
    expect(failed).toMatchObject([{ name: 'orphan' }]);
  });
});

describe('left behind', () => {
  it('names the files that did not go out, whatever the reason', () => {
    const [a, b, c] = [ready('a'), ready('b'), ready('c')];
    const tiles = [a, b, c, failedTile('big.bin')];
    // b failed to upload, big.bin never reached an upload
    expect(getLeftBehind(tiles, [a, c])).toEqual(['b', 'big.bin']);
  });

  it('says nothing when everything went out', () => {
    expect(describeLeftBehind([])).toBeUndefined();
    expect(describeLeftBehind(['a', 'b'])).toContain('a, b');
  });
});

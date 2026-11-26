import { describe, expect, it } from 'vitest';
import { describeSendGate, getSendGate } from '../../src/app/features/room/sendGate';
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
const preparing = (): TComposerTile => ({
  id: createTileId(),
  status: ComposerTileStatus.Preparing,
  name: 'p',
  size: 1,
  encrypting: false,
});
const failedTile = (): TComposerTile => ({
  id: createTileId(),
  status: ComposerTileStatus.Failed,
  name: 'big',
  size: 2,
  failure: { kind: 'too-large', size: 2, limit: 1 },
});

const upload = (tile: ReadyTile, status: UploadStatus): Upload => {
  const { file } = tile.item;
  switch (status) {
    case UploadStatus.Success:
      return { file, status, mxc: 'mxc://hs/x' };
    case UploadStatus.Loading:
      return {
        file,
        status,
        promise: new Promise(() => undefined),
        progress: { loaded: 1, total: 2 },
      };
    case UploadStatus.Error:
      return { file, status, error: new Error('x') as never };
    default:
      return { file, status: UploadStatus.Idle };
  }
};

describe('getSendGate', () => {
  it('is open with no files and once every file is up', () => {
    expect(getSendGate([], []).kind).toBe('ready');
    const [a, b] = [ready('a'), ready('b')];
    expect(
      getSendGate([a, b], [upload(a, UploadStatus.Success), upload(b, UploadStatus.Success)]).kind
    ).toBe('ready');
  });

  it('waits while a file is being prepared, and counts them', () => {
    const a = ready('a');
    expect(getSendGate([a, preparing(), preparing()], [upload(a, UploadStatus.Success)])).toEqual({
      kind: 'preparing',
      count: 2,
    });
  });

  it('waits while a file uploads, or is about to start uploading', () => {
    const [a, b, c] = [ready('a'), ready('b'), ready('c')];
    expect(
      getSendGate(
        [a, b, c],
        [
          upload(a, UploadStatus.Loading),
          upload(b, UploadStatus.Idle),
          upload(c, UploadStatus.Success),
        ]
      )
    ).toEqual({ kind: 'uploading', count: 2 });
  });

  it('is not held up by a file that failed, over the limit or in an upload', () => {
    const [a, b] = [ready('a'), ready('b')];
    expect(
      getSendGate(
        [a, b, failedTile()],
        [upload(a, UploadStatus.Success), upload(b, UploadStatus.Error)]
      ).kind
    ).toBe('ready');
  });

  it('has nothing to send when every file failed', () => {
    const a = ready('a');
    expect(getSendGate([a, failedTile()], [upload(a, UploadStatus.Error)]).kind).toBe(
      'nothing-ready'
    );
    expect(getSendGate([failedTile()], []).kind).toBe('nothing-ready');
  });
});

describe('describeSendGate', () => {
  it('has a reason for every wait and none when open', () => {
    expect(describeSendGate({ kind: 'ready' })).toBeUndefined();
    expect(describeSendGate({ kind: 'preparing', count: 1 })).toBeTruthy();
    expect(describeSendGate({ kind: 'uploading', count: 3 })).toContain('3');
    expect(describeSendGate({ kind: 'nothing-ready' })).toBeTruthy();
  });
});

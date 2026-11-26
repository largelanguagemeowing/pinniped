import { describe, expect, it } from 'vitest';
import { getUploadTotals } from '../../src/app/features/room/uploadProgress';
import { Upload, UploadStatus } from '../../src/app/state/upload';

const file = (size: number) => ({ name: 'f', size }) as File;
const success = (size: number): Upload => ({
  file: file(size),
  status: UploadStatus.Success,
  mxc: 'm',
});
const loading = (size: number, loaded: number): Upload => ({
  file: file(size),
  status: UploadStatus.Loading,
  promise: new Promise(() => undefined),
  progress: { loaded, total: size },
});
const idle = (size: number): Upload => ({ file: file(size), status: UploadStatus.Idle });
const failed = (size: number): Upload => ({
  file: file(size),
  status: UploadStatus.Error,
  error: new Error('x') as never,
});

describe('getUploadTotals', () => {
  it('counts a finished file in full, a running one by its progress and a waiting one as nothing', () => {
    expect(getUploadTotals([success(100), loading(200, 50), idle(300)])).toEqual({
      loadedBytes: 150,
      totalBytes: 600,
      done: 1,
      count: 3,
    });
  });

  it('leaves a failed file out, since it adds nothing to wait for', () => {
    expect(getUploadTotals([success(100), failed(900)])).toEqual({
      loadedBytes: 100,
      totalBytes: 100,
      done: 1,
      count: 1,
    });
  });

  it('is empty without files', () => {
    expect(getUploadTotals([])).toEqual({ loadedBytes: 0, totalBytes: 0, done: 0, count: 0 });
  });
});

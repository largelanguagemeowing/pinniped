import React from 'react';
import { act, create } from 'react-test-renderer';
import { atom, createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import {
  UploadBoardImperativeHandlers,
  UploadBoardSender,
} from '../../src/app/components/upload-board/UploadBoard';
import { TUploadFamilyObserverAtom, Upload, UploadStatus } from '../../src/app/state/upload';

vi.mock('folds', () => ({ Box: 'div', as: (c: unknown) => c }));
vi.mock('../../src/app/components/upload-board/UploadBoard.css', () => ({}));

const file = (name: string) => ({ name }) as never;
const done = (name: string): Upload => ({
  file: file(name),
  status: UploadStatus.Success,
  mxc: `mxc://x/${name}`,
});
const loading = (name: string): Upload => ({
  file: file(name),
  status: UploadStatus.Loading,
  promise: new Promise(() => undefined),
  progress: { loaded: 1, total: 10 },
});
const failed = (name: string): Upload => ({
  file: file(name),
  status: UploadStatus.Error,
  error: new Error('x') as never,
});

const mount = (uploads: Upload[]) => {
  const store = createStore();
  const observer = atom(uploads) as unknown as TUploadFamilyObserverAtom;
  const handlers: { current?: UploadBoardImperativeHandlers } = {};
  act(() => {
    create(
      <Provider store={store}>
        <UploadBoardSender
          uploadFamilyObserverAtom={observer}
          onSend={vi.fn()}
          imperativeHandlerRef={handlers}
        />
      </Provider>
    );
  });
  return handlers.current!;
};

describe('UploadBoardSender', () => {
  it('is uploading while a file has not finished', () => {
    expect(mount([done('a'), loading('b')]).isUploading()).toBe(true);
  });

  it('is not uploading once every file is up, or one failed for good', () => {
    expect(mount([done('a'), done('b')]).isUploading()).toBe(false);
    expect(mount([done('a'), failed('b')]).isUploading()).toBe(false);
  });
});

// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { Chip } from 'folds';
import { ImageViewer } from '../../src/app/components/image-viewer/ImageViewer';
import { downloadMedia } from '../../src/app/utils/matrix';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
vi.mock('../../src/app/components/image-viewer/ImageViewer.css', () => ({
  ImageViewer: 'c',
  ImageViewerHeader: 'c',
  ImageViewerContent: 'c',
  ImageViewerImg: 'c',
  MagnifierLens: 'c',
  MagnifierImg: 'c',
}));
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }));
vi.mock('../../src/app/utils/matrix', () => ({ downloadMedia: vi.fn() }));

let renderer: ReactTestRenderer;
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

// the download chip is the only one with the primary or critical variant
const downloadChip = () =>
  renderer.root.findAll(
    (node) =>
      node.type === Chip && (node.props.variant === 'Primary' || node.props.variant === 'Critical')
  )[0];

beforeEach(async () => {
  vi.mocked(FileSaver.saveAs).mockReset();
  vi.mocked(downloadMedia).mockReset();
  await act(async () => {
    renderer = create(<ImageViewer alt="cat.png" src="blob:test/1" requestClose={() => {}} />);
  });
});

afterEach(() => {
  act(() => renderer.unmount());
});

describe('ImageViewer download', () => {
  it('saves the downloaded image under its name', async () => {
    const blob = new Blob(['img']);
    vi.mocked(downloadMedia).mockResolvedValue(blob);

    await act(async () => downloadChip().props.onClick());
    await flush();

    expect(FileSaver.saveAs).toHaveBeenCalledWith(blob, 'cat.png');
  });

  it('shows a failed download on the chip instead of rejecting unhandled', async () => {
    vi.mocked(downloadMedia).mockRejectedValue(new Error('Media download failed (401)'));

    // a handler that rejected would fail the test here, or as an unhandled rejection
    await act(async () => downloadChip().props.onClick());
    await flush();

    expect(FileSaver.saveAs).not.toHaveBeenCalled();
    expect(downloadChip().props.variant).toBe('Critical');
  });

  it('does not start a second download while one is running, and allows a retry after a failure', async () => {
    let fail!: (e: Error) => void;
    vi.mocked(downloadMedia).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    await act(async () => downloadChip().props.onClick());
    await flush();
    expect(downloadChip().props.disabled).toBe(true);

    await act(async () => fail(new Error('offline')));
    await flush();

    expect(downloadChip().props.disabled).toBeFalsy();
    vi.mocked(downloadMedia).mockResolvedValueOnce(new Blob(['img']));
    await act(async () => downloadChip().props.onClick());
    await flush();
    expect(FileSaver.saveAs).toHaveBeenCalledTimes(1);
  });
});

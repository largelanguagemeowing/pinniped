// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { UploadBoardProgress } from '../../src/app/components/upload-board';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/components/upload-board/UploadBoard.css', anyStyle);
vi.mock('../../src/app/components/upload-card/UploadCard.css', anyStyle);

const render = (totals: Parameters<typeof UploadBoardProgress>[0]['totals']) => {
  const renderer = create(<UploadBoardProgress totals={totals} />);
  return renderer;
};

describe('UploadBoardProgress', () => {
  it('shows the files and bytes together while some are still on their way', () => {
    let renderer!: ReturnType<typeof render>;
    act(() => {
      renderer = render({ loadedBytes: 50, totalBytes: 200, done: 1, count: 3 });
    });
    const texts = renderer.root
      .findAll((node) => node.children.some((child) => typeof child === 'string'))
      .flatMap((node) => node.children.filter((child) => typeof child === 'string'));
    expect(texts).toContain('1 of 3 files uploaded');
    expect(texts).toContain('25%');
  });

  it('shows nothing once every file is up, or when there is none to wait for', () => {
    let done!: ReturnType<typeof render>;
    let none!: ReturnType<typeof render>;
    act(() => {
      done = render({ loadedBytes: 200, totalBytes: 200, done: 3, count: 3 });
      none = render({ loadedBytes: 0, totalBytes: 0, done: 0, count: 0 });
    });
    expect(done.toJSON()).toBeNull();
    expect(none.toJSON()).toBeNull();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chip } from 'folds';
import { PdfViewer } from '../../src/app/components/Pdf-viewer/PdfViewer';
import { createPage } from '../../src/app/plugins/pdfjs-dist';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
vi.mock('../../src/app/components/Pdf-viewer/PdfViewer.css', () => ({
  PdfViewer: 'c',
  PdfViewerHeader: 'c',
  PdfViewerFooter: 'c',
  PdfViewerContent: 'c',
}));
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }));
vi.mock('../../src/app/plugins/pdfjs-dist', async () => {
  const { AsyncStatus } = await import('../../src/app/hooks/useAsyncCallback');
  const pdfJS = {};
  const doc = { numPages: 3 };
  const loaded = (data: unknown) => [{ status: AsyncStatus.Success, data }, () => {}];
  return {
    usePdfJSLoader: () => loaded(pdfJS),
    usePdfDocumentLoader: () => loaded(doc),
    createPage: vi.fn(),
  };
});

type Page = { canvas: HTMLCanvasElement; resolve: () => void };
let pages: Record<number, Page>;
let container: HTMLDivElement;
let renderer: ReactTestRenderer;

beforeEach(async () => {
  pages = {};
  container = document.createElement('div');
  container.scrollTo = () => {};
  // each render waits until the test releases it, like a page that is slow to load
  vi.mocked(createPage).mockImplementation(
    (_doc, pageNo) =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.dataset.page = String(pageNo);
        pages[pageNo] = { canvas, resolve: () => resolve(canvas) };
      })
  );
  await act(async () => {
    renderer = create(<PdfViewer name="a.pdf" src="blob:test/1" requestClose={() => {}} />, {
      createNodeMock: (element) => (element.type === 'div' ? container : null),
    });
  });
});

afterEach(() => {
  act(() => renderer.unmount());
});

const shownPage = () => (container.firstElementChild as HTMLElement | null)?.dataset.page;

const clickNext = () =>
  act(async () => {
    renderer.root
      .findAllByType(Chip)
      .find((c) => c.props.after)!
      .props.onClick();
  });

describe('PdfViewer page rendering', () => {
  it('shows the page the footer says, even when an earlier page finishes last', async () => {
    await clickNext();
    await act(async () => pages[2].resolve());
    await act(async () => pages[1].resolve());

    expect(shownPage()).toBe('2');
  });

  it('shows a page that finishes in order', async () => {
    await act(async () => pages[1].resolve());
    expect(shownPage()).toBe('1');

    await clickNext();
    await act(async () => pages[2].resolve());

    expect(shownPage()).toBe('2');
  });
});

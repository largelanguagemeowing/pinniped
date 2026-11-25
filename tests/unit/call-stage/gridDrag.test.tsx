// @vitest-environment jsdom
import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  Grid,
  useUpdateLayout,
  type DragCallback,
  type LayoutProps,
  type TileDragState,
} from '../../../src/app/features/call/stage/grid/Grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../src/app/features/call/stage/grid/Grid.css', () => ({
  grid: 'grid',
  slot: 'slot',
}));

// The tiles' own gesture binding is not under test; the grid's drag handler is called directly.
const drags = vi.hoisted(
  () => new Map<string, { current: (id: string, state: TileDragState) => void }>()
);
vi.mock('../../../src/app/features/call/stage/grid/TileWrapper', () => ({
  TileWrapper: ({
    id,
    onDrag,
  }: {
    id: string;
    onDrag: { current: (id: string, state: TileDragState) => void } | null;
  }) => {
    if (onDrag) drags.set(id, onDrag);
    return null;
  },
}));

beforeAll(() => {
  window.matchMedia = () =>
    ({ matches: false, addEventListener() {}, removeEventListener() {} }) as never;
  globalThis.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  } as never;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 100 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get: () => 100 });
});
afterEach(() => drags.clear());

type Model = string[];
function Layout({ ref, model, Slot }: LayoutProps<Model, string, HTMLDivElement>): ReactNode {
  useUpdateLayout();
  const onDrag: DragCallback = () => {};
  return (
    <div ref={ref}>
      {model.map((id) => (
        <Slot key={id} id={id} model={id} onDrag={onDrag} />
      ))}
    </div>
  );
}

const drag = (id: string, last: boolean): void =>
  drags.get(id)!.current(id, {
    tap: false,
    initial: [0, 0],
    delta: [5, 5],
    last,
  } as unknown as TileDragState);

describe('Grid drag', () => {
  it('lets the next drag work after the dragged tile left the layout mid-gesture', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const renderGrid = (model: Model) =>
      act(async () => {
        root.render(<Grid name="test" model={model} Layout={Layout} Tile={() => null} />);
      });
    await renderGrid(['a', 'b']);

    await act(async () => drag('a', false));
    await renderGrid(['b']);
    await act(async () => drag('a', true));

    // b is dragged next and released: that must not throw.
    await act(async () => drag('b', false));
    expect(() => drag('b', true)).not.toThrow();
  });
});

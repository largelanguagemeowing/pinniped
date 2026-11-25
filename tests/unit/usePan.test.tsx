// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { usePan } from '../../src/app/hooks/usePan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PanApi = ReturnType<typeof usePan>;
let api: PanApi;
let renderer: ReactTestRenderer;

function Probe({ active }: { active: boolean }) {
  api = usePan(active);
  return null;
}

const render = (active: boolean) => {
  act(() => {
    if (renderer) renderer.update(<Probe active={active} />);
    else renderer = create(<Probe active={active} />);
  });
};

const startDrag = () =>
  act(() => api.onMouseDown({ preventDefault: () => {} } as React.MouseEvent<HTMLElement>));

const dragBy = (movementX: number, buttons = 1) =>
  act(() => {
    const evt = new MouseEvent('mousemove', { buttons, cancelable: true });
    Object.defineProperty(evt, 'movementX', { value: movementX });
    Object.defineProperty(evt, 'movementY', { value: 0 });
    document.dispatchEvent(evt);
  });

afterEach(() => {
  act(() => renderer.unmount());
  renderer = undefined as never;
});

describe('usePan', () => {
  it('moves the image while the primary button is held', () => {
    render(true);
    startDrag();
    dragBy(5);

    expect(api.pan.translateX).toBe(5);
    expect(api.cursor).toBe('grabbing');
  });

  it('ends a drag that is running when the image stops being pannable', () => {
    render(true);
    startDrag();
    dragBy(5);

    render(false);
    dragBy(7);

    expect(api.pan).toEqual({ translateX: 0, translateY: 0 });
    expect(api.cursor).toBe('initial');
  });
});

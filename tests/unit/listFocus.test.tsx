import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { useListFocusIndex } from '../../src/app/hooks/useListFocusIndex';

describe('useListFocusIndex', () => {
  it('stays on a row of the list when the list shrinks past the focus', () => {
    let focus!: ReturnType<typeof useListFocusIndex>;
    function Probe({ size }: { size: number }) {
      focus = useListFocusIndex(size, 0);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe size={10} />);
    });
    act(() => {
      for (let i = 0; i < 7; i += 1) focus.next();
    });
    expect(focus.index).toBe(7);

    act(() => renderer.update(<Probe size={3} />));
    expect(focus.index).toBe(2);

    act(() => renderer.update(<Probe size={0} />));
    expect(focus.index).toBe(0);
  });
});

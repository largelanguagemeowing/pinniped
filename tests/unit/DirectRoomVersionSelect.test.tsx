import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { DirectRoomVersionSelect } from '../../src/app/components/direct-room-version';
import { CapabilitiesProvider } from '../../src/app/hooks/useCapabilities';

vi.mock('folds', () => ({
  Box: 'div',
  RadioButton: 'input',
  config: { space: { S300: '0' } },
}));
vi.mock('../../src/app/components/sequence-card', () => ({ SequenceCard: 'section' }));
vi.mock('../../src/app/components/setting-tile', () => ({
  SettingTile: ({ after }: { after: React.ReactNode }) => <div>{after}</div>,
}));

function render(
  props: Partial<React.ComponentProps<typeof DirectRoomVersionSelect>> = {},
  available?: Record<string, string>
) {
  const onChange = vi.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <CapabilitiesProvider
        value={available ? { 'm.room_versions': { default: '12', available } } : {}}
      >
        <DirectRoomVersionSelect value="12" onChange={onChange} {...props} />
      </CapabilitiesProvider>
    );
  });
  return { onChange, radios: renderer.root.findAllByType('input') };
}

describe('DirectRoomVersionSelect', () => {
  it('offers both versions, with the chosen one checked', () => {
    const { radios } = render({ value: '11' });

    expect(radios.map((r) => r.props.checked)).toEqual([false, true]);
  });

  it('reports the version that is picked', () => {
    const { onChange, radios } = render();

    act(() => radios[1].props.onClick());
    expect(onChange).toHaveBeenCalledWith('11');
  });

  it('does not offer a version the server cannot make', () => {
    const { radios } = render({}, { '12': 'stable' });

    expect(radios.map((r) => !!r.props.disabled)).toEqual([false, true]);
  });
});

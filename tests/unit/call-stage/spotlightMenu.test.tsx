// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { SpotlightTile } from '../../../src/app/features/call/stage/tile/SpotlightTile';
import { StageContext, type Stage } from '../../../src/app/features/call/stage/StageContext';
import { type SpotlightTileViewModel } from '../../../src/app/plugins/call/engine/state/TileViewModel';

// The media items are not what is under test; the tile only needs to render them.
vi.mock('../../../src/app/features/call/stage/tile/MediaView', () => ({
  MediaView: () => null,
}));

// Stylesheets are compiled by the build; here every class name is just a name.
const classNames = vi.hoisted(() => {
  const names = [
    'tile',
    'maximised',
    'contents',
    'item',
    'snap',
    'advance',
    'back',
    'next',
    'indicators',
    'showIndicators',
    'indicator',
    'bottomRightButtons',
    'leadingIcon',
  ];
  return Object.fromEntries(names.map((name) => [name, name]));
});
vi.mock('../../../src/app/features/call/stage/tile/SpotlightTile.css', () => ({ ...classNames }));
vi.mock('../../../src/app/features/call/stage/tile/MediaView.css', () => ({ ...classNames }));
vi.mock('../../../src/app/components/slider', () => ({ VolumeSlider: () => null }));

class FakeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}
globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;

const constant = <T,>(value: T) => new BehaviorSubject(value);

const screenShare = {
  id: 'share',
  type: 'screen share',
  local: true,
  userId: '@sharer:example.org',
  displayName$: constant('Sharer'),
  mxcAvatarUrl$: constant(undefined),
  video$: constant(undefined),
  unencryptedWarning$: constant(false),
};

describe('SpotlightTile', () => {
  it('opens the participant menu of the shown stream on right-click', () => {
    const openMemberMenu = vi.fn();
    const stage = { openMemberMenu } as unknown as Stage;
    const vm = {
      media$: constant([screenShare]),
      maximised$: constant(false),
    } as unknown as SpotlightTileViewModel;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <StageContext value={stage}>
          <SpotlightTile
            vm={vm}
            expanded
            targetWidth={800}
            targetHeight={600}
            showIndicators={false}
            showNameTags
            focusable
          />
        </StageContext>
      );
    });

    const preventDefault = vi.fn();
    const root = renderer.root.find((node) => typeof node.props.onContextMenu === 'function');
    root.props.onContextMenu({
      preventDefault,
      nativeEvent: { clientX: 30, clientY: 40 },
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(openMemberMenu).toHaveBeenCalledWith('@sharer:example.org', {
      x: 30,
      y: 40,
      width: 0,
      height: 0,
    });
  });
});

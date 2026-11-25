// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from 'folds';
import { SoundPackEditor } from '../../src/app/features/soundboard/SoundPackEditor';
import { SoundPack, SoundPackContent } from '../../src/app/plugins/sound-pack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// style modules are built by a bundler plugin; any class name will do here
const anyStyle = vi.hoisted(
  () => () =>
    new Proxy({}, { has: () => true, get: (_t, key) => (key === 'then' ? undefined : () => 'c') })
);
vi.mock('../../src/app/styles/ContainerColor.css', anyStyle);
vi.mock('../../src/app/components/sequence-card/style.css', anyStyle);
vi.mock('../../src/app/styles/Text.css', anyStyle);
vi.mock('../../src/app/features/settings/styles.css', anyStyle);

const client = vi.hoisted(() => ({}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => client }));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => true,
}));
vi.mock('../../src/app/features/soundboard/EmojiPickerButton', () => ({
  EmojiPickerButton: () => null,
}));

const content: SoundPackContent = {
  sounds: {
    a: { url: 'mxc://hs/a', name: 'A' },
    b: { url: 'mxc://hs/b', name: 'B' },
  },
};

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;
const players: { paused: boolean }[] = [];
let renderer: ReactTestRenderer;
const onUpdate = vi.fn<(content: SoundPackContent) => Promise<unknown>>();

class FakeAudio {
  paused = false;

  addEventListener() {}

  pause() {
    this.paused = true;
  }

  play() {
    return Promise.resolve();
  }

  constructor() {
    players.push(this);
  }
}

const buttons = (label: string) =>
  renderer.root.findAllByType(IconButton).filter((b) => b.props['aria-label'] === label);

beforeEach(async () => {
  live.clear();
  created = 0;
  players.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      created += 1;
      const url = `blob:test/${created}`;
      live.add(url);
      return url;
    },
    revokeObjectURL: (url: string) => live.delete(url),
  });
  onUpdate.mockReset().mockResolvedValue(undefined);
  await act(async () => {
    renderer = create(
      <SoundPackEditor pack={new SoundPack('user', content)} canEdit onUpdate={onUpdate} />
    );
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe('SoundPackEditor changes', () => {
  it('does not carry a change that failed to save into the next one', async () => {
    onUpdate.mockRejectedValueOnce(new Error('offline'));

    await act(async () => buttons('Delete')[0].props.onClick());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => buttons('Delete')[1].props.onClick());

    expect(onUpdate).toHaveBeenCalledTimes(2);
    // the first delete failed, so only the second one is in what is written now
    expect(Object.keys(onUpdate.mock.calls[1][0].sounds ?? {})).toEqual(['a']);
  });
});

describe('SoundPackEditor preview of a chosen file', () => {
  const chooseFile = async () => {
    const input = renderer.root.findByProps({ type: 'file' });
    const file = new File(['x'], 'beep.mp3', { type: 'audio/mpeg' });
    await act(async () => input.props.onChange({ currentTarget: { files: [file] } }));
  };
  const preview = () => act(async () => buttons('Preview chosen file')[0].props.onClick());

  it('keeps one object URL, for the preview that is current', async () => {
    await chooseFile();
    await preview();
    await preview();

    expect(created).toBe(2);
    expect(live.size).toBe(1);
    expect(players.map((p) => p.paused)).toEqual([true, false]);
  });

  it('keeps none once the editor is gone', async () => {
    await chooseFile();
    await preview();

    act(() => renderer.unmount());

    expect(live.size).toBe(0);
    renderer = create(<div />);
  });
});

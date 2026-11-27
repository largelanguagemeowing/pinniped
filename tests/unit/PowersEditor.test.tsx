import React from 'react';
import { act, create, ReactTestInstance } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PowersEditor } from '../../src/app/features/common-settings/permissions/PowersEditor';
import { RoomProvider } from '../../src/app/hooks/useRoom';

const state = vi.hoisted(() => ({
  stored: undefined as Record<string, unknown> | undefined,
  sendStateEvent: vi.fn(async () => ({})),
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ sendStateEvent: state.sendStateEvent }),
}));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));
vi.mock('../../src/app/hooks/useImagePackRooms', () => ({ useImagePackRooms: () => [] }));
vi.mock('../../src/app/hooks/useFilePicker', () => ({ useImageFilePicker: () => () => undefined }));
vi.mock('../../src/app/hooks/useMemberPowerTag', () => ({ getPowerTagIconSrc: () => undefined }));
vi.mock('../../src/app/components/page', () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/components/sequence-card', () => ({
  SequenceCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/features/common-settings/styles.css', () => ({
  SequenceCardStyle: 'card',
}));
vi.mock('../../src/app/components/setting-tile', () => ({
  SettingTile: ({ title, after }: { title: React.ReactNode; after: React.ReactNode }) => (
    <div>
      {title}
      {after}
    </div>
  ),
}));
vi.mock('../../src/app/components/HexColorPickerPopOut', () => ({
  HexColorPickerPopOut: () => null,
}));
vi.mock('../../src/app/components/power', () => ({
  PowerColorBadge: () => null,
  PowerIcon: () => null,
}));
vi.mock('../../src/app/components/emoji-board', () => ({ EmojiBoard: () => null }));
vi.mock('../../src/app/components/upload-card', () => ({ CompactUploadCardRenderer: () => null }));
vi.mock('../../src/app/components/BetaNoticeBadge', () => ({ BetaNoticeBadge: () => null }));
vi.mock('../../src/app/state/upload', () => ({ createUploadAtom: () => undefined }));
// the real settings module reads localStorage at import time
vi.mock('../../src/app/state/settings', () => ({ settingsAtom: 'settings' }));
vi.mock('../../src/app/state/hooks/settings', () => ({ useSetting: () => [false] }));
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  PopOut: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-colorful', () => ({ HexColorPicker: () => null }));

const room = {
  roomId: '!room:x',
  client: { on: () => undefined, removeListener: () => undefined },
  getVersion: () => '11',
  getLiveTimeline: () => ({
    getState: () => ({
      getStateEvents: () => (state.stored ? { getContent: () => state.stored } : undefined),
    }),
  }),
};

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

// a moderator at 50 and a member at 0; nobody holds 75
const powerLevels = { users_default: 0, users: { '@mod:x': 50, '@me:x': 100 } };

const mount = async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(
      <RoomProvider value={room as never}>
        <PowersEditor powerLevels={powerLevels as never} requestClose={() => undefined} />
      </RoomProvider>
    );
  });
  const button = (label: string) =>
    r.root.findAllByType('button').find((b) => textOf(b) === label)!;
  return { r, button };
};

const createTag = async (
  { r, button }: Awaited<ReturnType<typeof mount>>,
  power: string,
  name: string
) => {
  await act(async () => button('Create').props.onClick());
  await act(async () =>
    r.root.findAllByType('form')[0].props.onSubmit({
      preventDefault: () => undefined,
      target: { powerInput: { value: power }, nameInput: { value: name } },
    })
  );
  await act(async () => button('Apply Changes').props.onClick());
};

describe('PowersEditor', () => {
  beforeEach(() => {
    state.stored = undefined;
    state.sendStateEvent.mockClear();
  });

  it('writes only the tags the room defines and the ones the person edited', async () => {
    const editor = await mount();

    await createTag(editor, '75', 'Boss');

    expect(state.sendStateEvent).toHaveBeenCalledOnce();
    const content = (state.sendStateEvent.mock.calls[0] as unknown[])[2];
    expect(content).toEqual({ 75: { name: 'Boss' } });
  });

  it('keeps the tags the room already has', async () => {
    state.stored = { 50: { name: 'Helper' } };
    const editor = await mount();

    await createTag(editor, '75', 'Boss');

    const content = (state.sendStateEvent.mock.calls[0] as unknown[])[2];
    expect(content).toEqual({ 50: { name: 'Helper' }, 75: { name: 'Boss' } });
  });
});

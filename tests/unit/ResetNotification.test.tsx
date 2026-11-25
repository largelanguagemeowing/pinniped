import React from 'react';
import { act, create, ReactTestInstance } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetNotification } from '../../src/app/features/settings/notifications/ResetNotification';

const state = vi.hoisted(() => ({
  setAccountData: vi.fn(),
  getPushRules: vi.fn(),
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    setAccountData: state.setAccountData,
    getPushRules: state.getPushRules,
    deletePushRule: vi.fn(async () => ({})),
  }),
}));
vi.mock('../../src/app/components/sequence-card', () => ({
  SequenceCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/features/settings/styles.css', () => ({ SequenceCardStyle: 'card' }));
vi.mock('../../src/app/components/setting-tile', () => ({
  SettingTile: ({ after }: { after: React.ReactNode }) => <div>{after}</div>,
}));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

const openDeleteAll = async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<ResetNotification />);
  });
  const buttons = () => r.root.findAllByType('button');
  const opener = buttons().find((b) => textOf(b) === 'Delete All')!;
  await act(async () => opener.props.onClick());
  const confirm = () => buttons().find((b) => b.props.type === 'submit')!;
  const press = async () => {
    const button = confirm();
    // a disabled button receives no click
    if (button.props.disabled) return;
    await act(async () => {
      button.props.onClick();
    });
  };
  return { confirm, press, text: () => textOf(r.root) };
};

describe('ResetNotification confirmation', () => {
  beforeEach(() => {
    state.setAccountData.mockReset();
    state.getPushRules.mockReset();
    state.getPushRules.mockResolvedValue({ global: {} });
  });

  it('runs once however often the confirm button is pressed while it works', async () => {
    let release!: () => void;
    state.setAccountData.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const { press } = await openDeleteAll();

    await press();
    await press();
    await press();

    // delete-all writes two account data events per run
    expect(state.setAccountData).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('shows a failed run instead of leaving it unhandled', async () => {
    state.setAccountData.mockRejectedValue(new Error('offline'));
    const { press, text } = await openDeleteAll();

    await press();

    expect(text()).toContain('Failed! offline');
  });
});

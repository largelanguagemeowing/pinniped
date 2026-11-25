import React from 'react';
import { act, create, ReactTestInstance } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { InviteUserPrompt } from '../../src/app/components/invite-user-prompt/InviteUserPrompt';

// m.direct keys are whatever clients wrote; one need not be a user ID
const DIRECT_USERS = ['@bob:example.org', 'carol-bridged'];

vi.mock('../../src/app/hooks/useDirectUsers', () => ({ useDirectUsers: () => DIRECT_USERS }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));
vi.mock('../../src/app/hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({ navigateRoom: () => undefined }),
}));
vi.mock('../../src/app/utils/invite', () => ({ inviteUsers: vi.fn() }));
vi.mock('../../src/app/plugins/react-custom-html-parser', () => ({
  makeHighlightRegex: (words: string[]) => new RegExp(words.join('|'), 'gi'),
  highlightText: (_regex: RegExp, parts: string[]) => parts,
}));
vi.mock('../../src/app/styles/Text.css', () => ({ BreakWord: 'break-word' }));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));

vi.stubGlobal('window', { performance });

const room = { roomId: '!room:x', getMember: () => undefined };

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

const mount = async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<InviteUserPrompt room={room as never} requestClose={() => undefined} />);
  });
  const type = async (value: string) => {
    const input = r.root.findByProps({ name: 'userIdInput' });
    await act(async () => {
      input.props.onChange({ currentTarget: { value } });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
  };
  const suggestions = () =>
    r.root
      .findAll((n) => n.type === 'button' && n.props.type === 'button' && n.props.onClick)
      .map(textOf)
      .filter((t) => t !== '');
  return { type, suggestions };
};

describe('InviteUserPrompt suggestions', () => {
  it('names a contact whose ID is not a user ID by that ID', async () => {
    const { type, suggestions } = await mount();

    await type('carol');

    const labels = suggestions();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join(' ')).toContain('carol-bridged');
    expect(labels.join(' ')).not.toContain('undefined');
  });

  it('shows no suggestions once the input holds a complete user ID', async () => {
    const { type, suggestions } = await mount();

    await type('@bo');
    expect(suggestions().length).toBeGreaterThan(0);
    await type('@bob:example.org');

    expect(suggestions()).toEqual([]);
  });
});

import React, { act, MouseEventHandler } from 'react';
import { create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { MatrixEvent } from 'matrix-js-sdk';
import { useMemberEventParser } from '../../src/app/hooks/useMemberEventParser';

vi.mock('../../src/app/components/message/layout/layout.css', () => ({
  Username: 'Username',
  UsernameInline: 'UsernameInline',
  UsernameBold: 'UsernameBold',
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALICE = '@alice:example.org';
const BOB = '@bob:example.org';

type Member = { membership?: string; displayname?: string; avatar_url?: string; reason?: string };

const memberEvent = (sender: string, target: string, content: Member, prev: Member = {}) =>
  new MatrixEvent({
    type: 'm.room.member',
    sender,
    state_key: target,
    content,
    unsigned: { prev_content: prev },
  });

function Line({
  event,
  onUserClick,
}: {
  event: MatrixEvent;
  onUserClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const parse = useMemberEventParser(onUserClick);
  return <p>{parse(event).body}</p>;
}

const render = async (event: MatrixEvent, onUserClick = vi.fn()): Promise<ReactTestRenderer> => {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<Line event={event} onUserClick={onUserClick} />);
  });
  return renderer as ReactTestRenderer;
};

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');
const buttons = (renderer: ReactTestRenderer) => renderer.root.findAllByType('button');
/** Each name in the line, as [user ID the button opens, text it shows]. */
const names = (renderer: ReactTestRenderer) =>
  buttons(renderer).map((button) => [button.props['data-user-id'], textOf(button)]);

describe('membership lines', () => {
  it.each([
    ['invited', { membership: 'invite' }, {}],
    ['kicked', { membership: 'leave' }, { membership: 'join' }],
    ['banned', { membership: 'ban' }, { membership: 'join' }],
    ['unbanned', { membership: 'leave' }, { membership: 'ban' }],
  ])('"%s" names the sender first and the member second', async (verb, content, prev) => {
    const renderer = await render(memberEvent(ALICE, BOB, content, prev));
    expect(names(renderer)).toEqual([
      [ALICE, 'alice'],
      [BOB, 'bob'],
    ]);
    expect(textOf(renderer.root)).toContain(`alice ${verb} bob`);
  });

  it('names only the member when they act on themselves', async () => {
    const joined = await render(
      memberEvent(BOB, BOB, { membership: 'join', displayname: 'Bob B.' })
    );
    expect(names(joined)).toEqual([[BOB, 'Bob B.']]);
    expect(textOf(joined.root)).toBe('Bob B. joined the room');

    const left = await render(
      memberEvent(BOB, BOB, { membership: 'leave' }, { membership: 'join' })
    );
    expect(names(left)).toEqual([[BOB, 'bob']]);
  });

  it('opens the same member from both names of a display name change', async () => {
    const renderer = await render(
      memberEvent(
        BOB,
        BOB,
        { membership: 'join', displayname: 'Robert' },
        { membership: 'join', displayname: 'Bob' }
      )
    );
    expect(names(renderer)).toEqual([
      [BOB, 'Bob'],
      [BOB, 'Robert'],
    ]);
  });

  it('calls the handler on click and on right-click, from a real button', async () => {
    const onUserClick = vi.fn();
    const renderer = await render(memberEvent(ALICE, BOB, { membership: 'invite' }), onUserClick);
    const [sender] = buttons(renderer);
    expect(sender.props.type).toBe('button');

    sender.props.onClick({});
    sender.props.onContextMenu({});
    expect(onUserClick).toHaveBeenCalledTimes(2);
  });

  it('removes direction overrides and control characters from names and reasons', async () => {
    // U+202E reverses what follows it: unstripped, this name would rewrite the sentence.
    const renderer = await render(
      memberEvent(
        ALICE,
        BOB,
        { membership: 'ban', displayname: '‮bob⁦', reason: 'spam‮\u0007' },
        { membership: 'join' }
      )
    );
    expect(names(renderer)[1]).toEqual([BOB, 'bob']);
    expect(textOf(renderer.root)).toBe('alice banned bob spam');
  });

  it('never shows an empty name', async () => {
    // A display name of nothing but invisible characters falls back to the user ID's local part.
    const invisible = await render(
      memberEvent(BOB, BOB, { membership: 'join', displayname: '‮ ⁦' })
    );
    expect(names(invisible)).toEqual([[BOB, 'bob']]);

    // An ID with no local part to show falls back to the whole ID.
    const odd = await render(memberEvent('@:example.org', '@:example.org', { membership: 'join' }));
    expect(names(odd)[0][1]).not.toBe('');
  });
});

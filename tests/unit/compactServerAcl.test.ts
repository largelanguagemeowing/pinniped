import { describe, expect, it } from 'vitest';
import { MatrixEvent } from 'matrix-js-sdk';
import { compactServerAclEvent } from '../../src/client/compactServerAcl';

const aclEvent = (deny: string[], prevDeny?: string[]) =>
  new MatrixEvent({
    type: 'm.room.server_acl',
    state_key: '',
    room_id: '!r:x',
    event_id: '$e',
    sender: '@a:x',
    content: { allow: ['*'], deny },
    unsigned: prevDeny ? { prev_content: { allow: ['*'], deny: prevDeny } } : {},
  });

describe('compactServerAclEvent', () => {
  it('keeps the ACL content intact and drops prev_content', () => {
    const e = aclEvent(['bad.example', 'worse.example'], ['bad.example']);
    compactServerAclEvent(e);
    expect(e.getContent()).toEqual({ allow: ['*'], deny: ['bad.example', 'worse.example'] });
    expect(e.getPrevContent()).toEqual({});
  });

  it('ignores other event types', () => {
    const e = new MatrixEvent({
      type: 'm.room.member',
      state_key: '@a:x',
      content: { membership: 'join' },
      unsigned: { prev_content: { membership: 'invite' } },
    });
    compactServerAclEvent(e);
    expect(e.getPrevContent()).toEqual({ membership: 'invite' });
  });
});

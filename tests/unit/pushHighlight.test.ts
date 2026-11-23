import { describe, expect, it } from 'vitest';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { isHighlightForUser } from '../../src/app/utils/pushHighlight';

const mxFor = (userId: string, actions: unknown) =>
  ({ getUserId: () => userId, getPushActionsForEvent: () => actions }) as unknown as MatrixClient;
const eventFrom = (sender: string) => ({ getSender: () => sender }) as unknown as MatrixEvent;

describe('isHighlightForUser', () => {
  it('is true when the matching rule sets the highlight tweak', () => {
    const mx = mxFor('@me:x', { notify: true, tweaks: { highlight: true } });
    expect(isHighlightForUser(mx, eventFrom('@other:x'))).toBe(true);
  });

  it('is false for a notifying rule without the tweak', () => {
    const mx = mxFor('@me:x', { notify: true, tweaks: { sound: 'default' } });
    expect(isHighlightForUser(mx, eventFrom('@other:x'))).toBe(false);
  });

  it('is false when no rule matched', () => {
    expect(isHighlightForUser(mxFor('@me:x', null), eventFrom('@other:x'))).toBe(false);
  });

  it("never marks the user's own events", () => {
    const mx = mxFor('@me:x', { notify: true, tweaks: { highlight: true } });
    expect(isHighlightForUser(mx, eventFrom('@me:x'))).toBe(false);
  });
});

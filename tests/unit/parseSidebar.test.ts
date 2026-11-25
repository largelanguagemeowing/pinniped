import { describe, expect, it } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { parseSidebar } from '../../src/app/hooks/useSidebarItems';

/** A client that has joined these spaces and knows no others. */
const clientWith = (joinedSpaces: string[]) =>
  ({
    getRoom: (id: string) =>
      joinedSpaces.includes(id)
        ? {
            getMyMembership: () => 'join',
            getLiveTimeline: () => ({
              getState: () => ({
                getStateEvents: () => ({ getContent: () => ({ type: 'm.space' }) }),
              }),
            }),
          }
        : null,
  }) as unknown as MatrixClient;

describe('parseSidebar', () => {
  it('keeps a folder with the spaces still joined', () => {
    const items = parseSidebar(clientWith(['!a', '!b']), [], {
      sidebar: [{ id: 'f', name: 'Work', content: ['!a', '!gone', '!b'] }],
    });
    expect(items).toEqual([{ id: 'f', name: 'Work', content: ['!a', '!b'] }]);
  });

  it('drops a folder of spaces that were all left', () => {
    const items = parseSidebar(clientWith(['!c']), ['!c'], {
      sidebar: [{ id: 'f', content: ['!gone', '!also-gone'] }, '!c'],
    });
    expect(items).toEqual(['!c']);
  });
});

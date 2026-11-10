import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMsgDraft, storeMsgDraft } from '../../src/app/state/room/msgDraftStore';

const paragraph = (text: string) => [{ type: 'paragraph', children: [{ text }] }];

describe('message draft store', () => {
  let items: Map<string, string>;

  beforeEach(() => {
    items = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    });
  });

  it('returns a stored draft for its room only', () => {
    storeMsgDraft('!a:example.org', paragraph('hello'));
    expect(loadMsgDraft('!a:example.org')).toEqual(paragraph('hello'));
    expect(loadMsgDraft('!b:example.org')).toEqual([]);
  });

  it('removes the draft when it is stored empty', () => {
    storeMsgDraft('!a:example.org', paragraph('hello'));
    storeMsgDraft('!b:example.org', paragraph('other'));
    storeMsgDraft('!a:example.org', []);
    expect(loadMsgDraft('!a:example.org')).toEqual([]);
    expect(loadMsgDraft('!b:example.org')).toEqual(paragraph('other'));
  });

  it('ignores stored data that is not a draft map', () => {
    items.set('messageDrafts', '["not", "a", "map"]');
    expect(loadMsgDraft('!a:example.org')).toEqual([]);
    items.set('messageDrafts', '{broken');
    expect(loadMsgDraft('!a:example.org')).toEqual([]);
    items.set('messageDrafts', '{"!a:example.org":"text"}');
    expect(loadMsgDraft('!a:example.org')).toEqual([]);
  });

  it('keeps working when storage refuses the write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => storeMsgDraft('!a:example.org', paragraph('hello'))).not.toThrow();
  });
});

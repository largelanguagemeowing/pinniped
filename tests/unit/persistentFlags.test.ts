import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistentFlags } from '../../src/app/utils/persistentFlags';

const stubStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
};

describe('createPersistentFlags', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('remembers a flag in storage, so a new instance still sees it', () => {
    createPersistentFlags().set('a');
    expect(createPersistentFlags().has('a')).toBe(true);
    expect(createPersistentFlags().has('b')).toBe(false);
  });

  it('clears a flag', () => {
    const flags = createPersistentFlags();
    flags.set('a');
    flags.clear('a');
    expect(flags.has('a')).toBe(false);
    expect(createPersistentFlags().has('a')).toBe(false);
  });

  it('tells subscribers about changes until they unsubscribe', () => {
    const flags = createPersistentFlags();
    const listener = vi.fn();
    const unsubscribe = flags.subscribe(listener);
    flags.set('a');
    flags.clear('a');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    flags.set('a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the flag for the session when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    const flags = createPersistentFlags();
    flags.set('a');
    expect(flags.has('a')).toBe(true);
    flags.clear('a');
    expect(flags.has('a')).toBe(false);
  });
});

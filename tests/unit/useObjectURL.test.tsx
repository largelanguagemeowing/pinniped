import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useObjectURL } from '../../src/app/hooks/useObjectURL';
import { mediaBlobCache } from '../../src/app/utils/mediaBlobCache';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// object URLs that were created and not revoked yet
const live = new Set<string>();
let created = 0;
let renderers: ReactTestRenderer[] = [];
// what each probe got on its last render
const seen = new Map<string, string | undefined>();

function Probe({ name, object }: { name: string; object?: Blob }) {
  seen.set(name, useObjectURL(object));
  return null;
}

const mount = (name: string, object?: Blob): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Probe name={name} object={object} />);
  });
  renderers.push(renderer);
  return renderer;
};
const unmount = (renderer: ReactTestRenderer) => act(() => renderer.unmount());

let keys = 0;
// a blob the media cache loaded and keeps, in use by nobody
const cached = async (): Promise<Blob> => {
  keys += 1;
  const request = mediaBlobCache.request(`test-${keys}`, async () => new Blob(['media']));
  const blob = await request.blob;
  request.release();
  return blob;
};

beforeEach(() => {
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
});

afterEach(() => {
  act(() => renderers.forEach((renderer) => renderer.unmount()));
  renderers = [];
  mediaBlobCache.clear();
  expect(live.size).toBe(0);
  seen.clear();
  vi.unstubAllGlobals();
});

describe('useObjectURL', () => {
  it('has no URL without an object', () => {
    mount('a');

    expect(seen.get('a')).toBeUndefined();
    expect(created).toBe(0);
  });

  it('gives a blob of its own a URL that lasts as long as the component', () => {
    const renderer = mount('a', new Blob(['file']));
    const url = seen.get('a');

    expect(url).toBeDefined();
    expect(live.has(url ?? '')).toBe(true);

    unmount(renderer);
    expect(live.size).toBe(0);
  });

  it('replaces the URL when the object changes', () => {
    const renderer = mount('a', new Blob(['one']));
    const first = seen.get('a');

    act(() => renderer.update(<Probe name="a" object={new Blob(['two'])} />));

    expect(seen.get('a')).not.toBe(first);
    expect([...live]).toEqual([seen.get('a')]);

    act(() => renderer.update(<Probe name="a" />));
    expect(seen.get('a')).toBeUndefined();
    expect(live.size).toBe(0);
  });

  it('shows a cached blob again through the same URL instead of making one per mount', async () => {
    const blob = await cached();
    const before = created;

    const first = mount('a', blob);
    const url = seen.get('a');
    unmount(first);
    // kept by the cache, not revoked with the component
    expect(live.has(url ?? '')).toBe(true);

    mount('b', blob);
    expect(seen.get('b')).toBe(url);
    expect(created - before).toBe(1);
  });

  it('gives every component showing a cached blob the same URL', async () => {
    const blob = await cached();

    mount('a', blob);
    mount('b', blob);

    expect(seen.get('a')).toBeDefined();
    expect(seen.get('b')).toBe(seen.get('a'));
  });

  it('keeps a cached blob from being evicted while it is shown', async () => {
    const blob = await cached();
    const renderer = mount('a', blob);
    const url = seen.get('a') ?? '';

    mediaBlobCache.clear();
    expect(live.has(url)).toBe(true);

    unmount(renderer);
    mediaBlobCache.clear();
    expect(live.has(url)).toBe(false);
  });

  it('keeps showing a blob the cache discarded, and revokes its URL when it goes', async () => {
    const blob = await cached();
    const renderer = mount('a', blob);
    const url = seen.get('a') ?? '';

    mediaBlobCache.discard(blob);
    expect(live.has(url)).toBe(true);

    unmount(renderer);
    expect(live.has(url)).toBe(false);
  });
});

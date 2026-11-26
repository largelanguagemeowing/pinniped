import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MediaProgressState,
  MediaProgressStore,
  mediaProgress,
  progressPercent,
} from '../../src/app/utils/mediaProgress';
import { useMediaProgress } from '../../src/app/hooks/useMediaProgress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const url = 'https://hs.example/media/a';
const known = (loaded: number, total: number) => ({ length: 'known', loaded, total }) as const;

describe('media progress store', () => {
  it('is idle for a URL nothing is loading', () => {
    expect(new MediaProgressStore().get(url)).toEqual({ status: 'idle' });
  });

  it('shows a download from its start to its end', () => {
    const store = new MediaProgressStore();

    const tracker = store.begin(url);
    expect(store.get(url).status).toBe('loading');

    tracker.report(known(50, 200));
    expect(store.get(url)).toEqual({ status: 'loading', progress: known(50, 200) });

    tracker.end();
    expect(store.get(url)).toEqual({ status: 'idle' });
  });

  it('keeps downloads of different URLs apart', () => {
    const store = new MediaProgressStore();

    store.begin(url).report(known(1, 2));

    expect(store.get('https://hs.example/media/b')).toEqual({ status: 'idle' });
  });

  it('tells a listener only when the figure it shows changes', () => {
    const store = new MediaProgressStore();
    const listener = vi.fn();
    const tracker = store.begin(url);
    store.subscribe(url, listener);

    tracker.report(known(1000, 100_000));
    tracker.report(known(1200, 100_000));
    tracker.report(known(1900, 100_000));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get(url)).toEqual({ status: 'loading', progress: known(1000, 100_000) });

    tracker.report(known(2000, 100_000));
    expect(listener).toHaveBeenCalledTimes(2);

    tracker.report({ length: 'unknown', loaded: 2100 });
    expect(listener).toHaveBeenCalledTimes(3);

    tracker.end();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('stops telling a listener that left', () => {
    const store = new MediaProgressStore();
    const listener = vi.fn();
    const tracker = store.begin(url);

    store.subscribe(url, listener)();
    tracker.report(known(1, 2));

    expect(listener).not.toHaveBeenCalled();
  });

  it('stays loading until every download of the URL has ended', () => {
    const store = new MediaProgressStore();
    const first = store.begin(url);
    const second = store.begin(url);
    second.report(known(1, 4));

    first.end();
    first.end();
    expect(store.get(url).status).toBe('loading');

    second.end();
    expect(store.get(url)).toEqual({ status: 'idle' });
  });

  it('ignores a report after the end', () => {
    const store = new MediaProgressStore();
    const tracker = store.begin(url);

    tracker.end();
    tracker.report(known(1, 2));

    expect(store.get(url)).toEqual({ status: 'idle' });
  });

  it('gives the share of an announced length as a whole percent', () => {
    expect(progressPercent(known(0, 3))).toBe(0);
    expect(progressPercent(known(1, 3))).toBe(33);
    expect(progressPercent(known(3, 3))).toBe(100);
    // an empty file has all of its bytes
    expect(progressPercent(known(0, 0))).toBe(100);
  });
});

describe('useMediaProgress', () => {
  let renderer: ReactTestRenderer | undefined;
  let seen: MediaProgressState[] = [];

  function Probe({ url: probed }: { url: string | null }) {
    seen.push(useMediaProgress(probed));
    return null;
  }
  const mount = (probed: string | null) =>
    act(() => {
      renderer = create(<Probe url={probed} />);
    });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    seen = [];
  });

  it('follows the download of its URL', () => {
    mount(url);
    expect(seen.at(-1)).toEqual({ status: 'idle' });

    let tracker = mediaProgress.begin(url);
    act(() => tracker.report(known(1, 4)));
    expect(seen.at(-1)).toEqual({ status: 'loading', progress: known(1, 4) });

    act(() => tracker.end());
    expect(seen.at(-1)).toEqual({ status: 'idle' });

    // a later download of the same URL is followed again
    tracker = mediaProgress.begin(url);
    act(() => tracker.report(known(3, 4)));
    expect(seen.at(-1)).toEqual({ status: 'loading', progress: known(3, 4) });
    act(() => tracker.end());
  });

  it('shows a download that was already running when it mounted', () => {
    const tracker = mediaProgress.begin(url);
    tracker.report(known(2, 4));

    mount(url);

    expect(seen.at(-1)).toEqual({ status: 'loading', progress: known(2, 4) });
    act(() => tracker.end());
  });

  it('does not render again for another URL', () => {
    mount(url);
    const renders = seen.length;

    const tracker = mediaProgress.begin('https://hs.example/media/other');
    act(() => tracker.report(known(1, 2)));
    act(() => tracker.end());

    expect(seen.length).toBe(renders);
  });

  it('is idle without a URL', () => {
    mount(null);

    expect(seen.at(-1)).toEqual({ status: 'idle' });
  });
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaLoadProgress } from '../../src/app/components/message/content/MediaLoadProgress';
import { mediaProgress, MediaProgressTracker } from '../../src/app/utils/mediaProgress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const url = 'https://hs.example/media/progress';

let renderer: ReactTestRenderer | undefined;
let tracker: MediaProgressTracker | undefined;

const mount = (shown: string | null) =>
  act(() => {
    renderer = create(<MediaLoadProgress url={shown} />);
  });
// everything the component renders, as text
const text = (): string => {
  const collect = (node: unknown): string => {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(collect).join('');
    return collect((node as { children?: unknown }).children);
  };
  return collect(renderer?.toJSON());
};

afterEach(() => {
  act(() => {
    tracker?.end();
    renderer?.unmount();
  });
  tracker = undefined;
  renderer = undefined;
});

describe('MediaLoadProgress', () => {
  it('shows nothing while nothing is downloading', () => {
    mount(url);
    expect(renderer?.toJSON()).toBeNull();

    mount(null);
    expect(renderer?.toJSON()).toBeNull();
  });

  it('shows the share of an announced length and follows it', () => {
    mount(url);
    tracker = mediaProgress.begin(url);

    act(() => tracker?.report({ length: 'known', loaded: 1, total: 4 }));
    expect(text()).toContain('25');

    act(() => tracker?.report({ length: 'known', loaded: 3, total: 4 }));
    expect(text()).toContain('75');
  });

  it('shows how much arrived when the length is not announced, once something has', () => {
    mount(url);
    tracker = mediaProgress.begin(url);
    expect(renderer?.toJSON()).toBeNull();

    act(() => tracker?.report({ length: 'unknown', loaded: 3 * 1024 * 1024 }));
    expect(text()).toContain('3');
  });

  it('shows nothing again once the download has ended', () => {
    mount(url);
    tracker = mediaProgress.begin(url);
    act(() => tracker?.report({ length: 'known', loaded: 1, total: 4 }));

    act(() => tracker?.end());

    expect(renderer?.toJSON()).toBeNull();
  });
});

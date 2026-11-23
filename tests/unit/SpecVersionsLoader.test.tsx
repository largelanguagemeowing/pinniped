import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpecVersionsLoader } from '../../src/app/components/SpecVersionsLoader';

const state = vi.hoisted(() => ({ specVersions: vi.fn() }));
vi.mock('../../src/app/cs-api', () => ({ specVersions: state.specVersions }));

describe('SpecVersionsLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.specVersions.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps asking after the user continues without versions, and then hands them over', async () => {
    state.specVersions
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ versions: ['v1.11'] });
    const seen: string[][] = [];
    let ignore!: () => void;
    await act(async () => {
      create(
        <SpecVersionsLoader
          baseUrl="https://hs"
          fallback={() => <span>loading</span>}
          error={(_e, _retry, ignoreCb) => {
            ignore = ignoreCb;
            return <span>error</span>;
          }}
        >
          {(v) => {
            seen.push(v.versions);
            return <span>app</span>;
          }}
        </SpecVersionsLoader>
      );
    });
    expect(seen).toEqual([]);

    await act(async () => ignore());
    expect(seen.at(-1)).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(state.specVersions).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toEqual(['v1.11']);
  });

  it('does not flash the loading fallback while retrying after continue', async () => {
    state.specVersions.mockRejectedValue(new Error('down'));
    let ignore!: () => void;
    const fallback = vi.fn(() => <span>loading</span>);
    await act(async () => {
      create(
        <SpecVersionsLoader
          baseUrl="https://hs"
          fallback={fallback}
          error={(_e, _retry, ignoreCb) => {
            ignore = ignoreCb;
            return <span>error</span>;
          }}
        >
          {() => <span>app</span>}
        </SpecVersionsLoader>
      );
    });
    await act(async () => ignore());
    fallback.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fallback).not.toHaveBeenCalled();
  });
});

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type DependencyList,
  type Dispatch,
  type RefCallback,
  type RefObject,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** A value computed once, on the first render. */
export function useInitial<T>(getValue: () => T): T {
  const ref = useRef<{ value: T }>(undefined);
  ref.current ??= { value: getValue() };
  return ref.current.value;
}

export interface LatestRef<T> extends RefObject<T> {
  current: T;
}

/** A ref that always holds the latest committed value. */
export function useLatest<T>(value: T): LatestRef<T> {
  const ref = useRef<T>(value);
  // Updated after commit, not during render, so an uncommitted render cannot leak in.
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Combines several refs into one, so they can attach to the same element. */
export const useMergedRefs = <T>(
  ...refs: (RefObject<T | null> | RefCallback<T | null> | null | undefined)[]
): RefCallback<T | null> =>
  useCallback(
    (value: T | null) =>
      refs.forEach((ref) => {
        if (typeof ref === 'function') ref(value);
        else if (ref) ref.current = value;
      }),
    // The refs are the dependencies; this is not an array literal, so it cannot be checked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );

/**
 * Like useState, but the state is recomputed by `updateFn` whenever `deps` change, and the
 * setter forces an update.
 */
export const useReactiveState = <T>(
  updateFn: (prevState?: T) => T,
  deps: DependencyList
): [T, Dispatch<SetStateAction<T>>] => {
  const state = useRef<T | undefined>(undefined);
  if (state.current === undefined) state.current = updateFn();
  const prevDeps = useRef<DependencyList | undefined>(undefined);
  // The state lives in a ref; this counter forces an update when someone sets it.
  const [, setNumUpdates] = useState(0);
  if (
    prevDeps.current === undefined ||
    deps.length !== prevDeps.current.length ||
    // Deps might be NaN, so compare with Object.is rather than ===
    deps.some((d, i) => !Object.is(d, prevDeps.current![i]))
  ) {
    state.current = updateFn(state.current);
  }
  prevDeps.current = deps;
  return [
    state.current,
    useCallback(
      (action) => {
        if (typeof action === 'function') {
          state.current = (action as (prevValue: T) => T)(state.current!);
        } else {
          state.current = action;
        }
        setNumUpdates((n) => n + 1);
      },
      [setNumUpdates]
    ),
  ];
};

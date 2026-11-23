/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from 'rxjs';

import { type Call } from '../../../plugins/call/Call';
import { useSubjectValue } from './grid/videoTiles';

/** Each call's "hide people without video" toggle of the grid, kept while the call runs. */
const hideVideolessByCall = new WeakMap<Call, BehaviorSubject<boolean>>();

export const hideVideolessOf = (call: Call): BehaviorSubject<boolean> => {
  let hideVideoless$ = hideVideolessByCall.get(call);
  if (hideVideoless$ === undefined) {
    hideVideoless$ = new BehaviorSubject(false);
    hideVideolessByCall.set(call, hideVideoless$);
  }
  return hideVideoless$;
};

/** Whether the call's grid hides people without video, and a way to flip it. */
export function useHideVideoless(call: Call): [hidden: boolean, toggle: () => void] {
  const hideVideoless$ = hideVideolessOf(call);
  return [useSubjectValue(hideVideoless$), () => hideVideoless$.next(!hideVideoless$.value)];
}

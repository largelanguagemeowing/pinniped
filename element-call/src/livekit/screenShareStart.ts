/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Subject } from "rxjs";

/** The client asked to start a screen share, with the options it saved (see the io.cinny.screenshare action). */
export const screenShareStart$ = new Subject<void>();

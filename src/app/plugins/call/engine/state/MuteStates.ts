/*
Copyright 2023-2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from 'matrix-js-sdk/lib/logger';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  map,
  merge,
  Observable,
  of,
  Subject,
  switchMap,
} from 'rxjs';

import { type MediaDevices, type MediaDevice } from '../state/MediaDevices';
import { type ObservableScope } from './ObservableScope';
import { type Behavior } from './Behavior';

interface MuteStateData {
  enabled$: Observable<boolean>;
  syncing$: Observable<boolean>;
  set: ((enabled: boolean) => void) | null;
  toggle: (() => void) | null;
}

export type Handler = (desired: boolean) => Promise<boolean>;
const defaultHandler: Handler = async (desired) => Promise.resolve(desired);

/**
 * Internal class - exported only for testing purposes.
 * Do not use directly outside of tests.
 */
export class MuteState<Label, Selected> {
  private readonly handler$ = new BehaviorSubject(defaultHandler);
  /** Whether the device was last forced off (see forceMute$). */
  private forced = false;
  /** The last mute state the user had, restored once a forced mute ends. */
  private lastEnabled: boolean | undefined;

  public setHandler(handler: Handler): void {
    if (this.handler$.value !== defaultHandler)
      throw new Error('Multiple mute state handlers are not supported');
    this.handler$.next(handler);
  }

  public unsetHandler(): void {
    this.handler$.next(defaultHandler);
  }

  private readonly canControlDevices$ = combineLatest([
    this.device.available$,
    this.forceMute$,
  ]).pipe(
    map(([available, forceMute]) => {
      return !forceMute && available.size > 0;
    })
  );

  private readonly data$ = this.scope.behavior<MuteStateData>(
    this.canControlDevices$.pipe(
      distinctUntilChanged(),
      map((canControlDevices) => {
        logger.info(
          `MuteState: canControlDevices: ${canControlDevices}, enabled by default: ${this.enabledByDefault}`
        );
        if (!canControlDevices) {
          logger.info(`MuteState: devices connected: ${canControlDevices}, disabling`);
          // We need to sync the mute state with the handler
          // to ensure nothing is beeing published.
          this.forced = true;
          this.handler$.value(false).catch((err) => {
            logger.error('MuteState-disable: handler error', err);
          });
          return {
            enabled$: of(false),
            syncing$: of(false),
            set: null,
            toggle: null,
          };
        }

        // Assume the default value only once devices are actually connected. When a forced
        // mute has ended, the device is off, and the user's own setting is restored.
        const wasForced = this.forced;
        this.forced = false;
        const restoring = this.restoreAfterForce && wasForced;
        const restored = this.restoreAfterForce
          ? (this.lastEnabled ?? this.enabledByDefault)
          : this.enabledByDefault;
        let enabled = restoring ? false : restored;
        const set$ = new Subject<boolean>();
        const toggle$ = new Subject<void>();
        const syncing$ = new BehaviorSubject(false);
        const desired$ = merge(set$, toggle$.pipe(map(() => !enabled)));
        const enabled$ = new Observable<boolean>((subscriber) => {
          // A forced mute's "off" is not the user's choice, so it is not remembered.
          if (!wasForced) this.lastEnabled = enabled;
          subscriber.next(enabled);
          let latestDesired = restoring ? restored : enabled;

          const sync = async (): Promise<void> => {
            if (enabled === latestDesired) {
              syncing$.next(false);
            } else {
              const previouslyEnabled = enabled;
              syncing$.next(true);
              enabled = await firstValueFrom(
                this.handler$.pipe(switchMap(async (handler) => handler(latestDesired)))
              );
              if (enabled === previouslyEnabled) {
                syncing$.next(false);
              } else {
                this.lastEnabled = enabled;
                subscriber.next(enabled);
                syncing$.next(true);
                sync().catch((err) => {
                  // TODO: better error handling
                  logger.error('MuteState: handler error', err);
                });
              }
            }
          };

          const s = desired$.subscribe((desired) => {
            latestDesired = desired;
            if (syncing$.value === false) {
              syncing$.next(true);
              sync().catch((err) => {
                // TODO: better error handling
                logger.error('MuteState: handler error', err);
              });
            }
          });
          // After a forced mute the device is off but the user wants it as it was: sync to that.
          if (restoring && enabled !== latestDesired) {
            syncing$.next(true);
            sync().catch((err) => {
              logger.error('MuteState: handler error', err);
            });
          }
          return (): void => {
            s.unsubscribe();
            syncing$.complete();
          };
        });

        return {
          set: (value: boolean): void => set$.next(value),
          toggle: (): void => {
            if (syncing$.value) return;
            toggle$.next();
          },
          enabled$,
          syncing$,
        };
      })
    )
  );

  public readonly enabled$: Behavior<boolean> = this.scope.behavior(
    this.data$.pipe(switchMap(({ enabled$ }) => enabled$))
  );

  public readonly setEnabled$: Behavior<((enabled: boolean) => void) | null> = this.scope.behavior(
    this.data$.pipe(map(({ set }) => set))
  );

  public readonly toggle$: Behavior<(() => void) | null> = this.scope.behavior(
    this.data$.pipe(map(({ toggle }) => toggle))
  );

  public readonly syncing$: Behavior<boolean> = this.scope.behavior(
    this.data$.pipe(switchMap(({ syncing$ }) => syncing$))
  );

  public constructor(
    private readonly scope: ObservableScope,
    private readonly device: MediaDevice<Label, Selected>,
    private readonly enabledByDefault: boolean,
    /**
     * An optional observable which, when it emits `true`, will force the mute.
     * Used for video to stop camera when earpiece mode is on.
     * @private
     */
    private readonly forceMute$: Observable<boolean>,
    /**
     * Whether the user's own setting comes back when a forced mute ends. Otherwise the
     * setting is the default again, as for video in earpiece mode.
     * @private
     */
    private readonly restoreAfterForce = false
  ) {}
}

export class MuteStates {
  /**
   *  True if the selected audio output device is an earpiece.
   *  Used to force-disable video when on earpiece.
   */
  private readonly isEarpiece$ = combineLatest([
    this.mediaDevices.audioOutput.available$,
    this.mediaDevices.audioOutput.selected$,
  ]).pipe(
    map(([available, selected]) => {
      if (!selected?.id) return false;
      const device = available.get(selected.id);
      logger.info(`MuteStates: selected audio output device:`, device);
      return device?.type === 'earpiece';
    })
  );

  private readonly deafenedSubject$ = new BehaviorSubject(this.initialMuteState.deafened);

  /** Whether this client hears nothing of the call; deafening also mutes the microphone. */
  public readonly deafened$: Behavior<boolean> = this.deafenedSubject$;

  public readonly audio = new MuteState(
    this.scope,
    this.mediaDevices.audioInput,
    this.initialMuteState.audioEnabled,
    this.deafened$,
    true
  );
  public readonly video = new MuteState(
    this.scope,
    this.mediaDevices.videoInput,
    this.initialMuteState.videoEnabled,
    this.isEarpiece$
  );

  public constructor(
    private readonly scope: ObservableScope,
    private readonly mediaDevices: MediaDevices,
    private readonly initialMuteState: {
      audioEnabled: boolean;
      videoEnabled: boolean;
      deafened: boolean;
    }
  ) {}

  public setDeafened(deafened: boolean): void {
    this.deafenedSubject$.next(deafened);
  }
}

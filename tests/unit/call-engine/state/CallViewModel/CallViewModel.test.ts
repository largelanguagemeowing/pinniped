/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi, onTestFinished, it, describe } from 'vitest';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  NEVER,
  type Observable,
  switchMap,
} from 'rxjs';
import { SyncState } from 'matrix-js-sdk';
import {
  ConnectionState,
  type LocalTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';
import { Status, type CallMembership } from 'matrix-js-sdk/lib/matrixrtc';
import { deepCompare } from 'matrix-js-sdk/lib/utils';

import { type Layout } from '../../../../../src/app/plugins/call/engine/state/layout-types';
import {
  mockMatrixRoomMember,
  mockRemoteParticipant,
  withTestScheduler,
  mockRtcMembership,
} from '../../utils/test';
import { E2eeType } from '../../../../../src/app/plugins/call/engine/e2ee/e2eeType';
import {
  alice,
  aliceId,
  aliceParticipant,
  aliceRtcMember,
  bob,
  bobId,
  bobRtcMember,
  local,
  localId,
  localRtcMember,
  localRtcMemberDevice2,
} from '../../utils/test-fixtures';
import { type Behavior, constant } from '../../../../../src/app/plugins/call/engine/state/Behavior';
import {
  localParticipant,
  withCallViewModel as withCallViewModelInMode,
} from './CallViewModelTestUtils';
import { MatrixRTCMode } from '../../../../../src/app/plugins/call/engine/state/CallViewModel/matrixRTCMode';

vi.mock('rxjs', async (importOriginal) => ({
  ...(await importOriginal()),
  // Disable interval Observables for the following tests since the test
  // scheduler will loop on them forever and never call the test 'done'
  interval: (): Observable<number> => NEVER,
}));

vi.mock('@livekit/components-core');
vi.mock('livekit-client/e2ee-worker?worker');

const getPlatform = vi.hoisted(() => vi.fn(() => 'desktop'));
vi.mock('../../../../../src/app/plugins/call/engine/Platform', () => ({
  get platform(): string {
    return getPlatform();
  },
  isFirefox: (): boolean => false,
}));

const yesNo = {
  y: true,
  n: false,
};

const daveRtcMember = mockRtcMembership('@dave:example.org', 'DDDD');

// const carol = local;

const dave = mockMatrixRoomMember(daveRtcMember, { rawDisplayName: 'Dave' });

const daveId = `${dave.userId}:${daveRtcMember.deviceId}`;

const bobParticipant = mockRemoteParticipant({ identity: bobId });
const daveParticipant = mockRemoteParticipant({ identity: daveId });

export interface GridLayoutSummary {
  type: 'grid';
  spotlight?: string[];
  grid: string[];
}

export interface SpotlightLandscapeLayoutSummary {
  type: 'spotlight-landscape';
  spotlight: string[];
  grid: string[];
}

export interface SpotlightPortraitLayoutSummary {
  type: 'spotlight-portrait';
  spotlight: string[];
  grid: string[];
}

export interface SpotlightExpandedLayoutSummary {
  type: 'spotlight-expanded';
  spotlight: string[];
  pip?: string;
}

export interface OneOnOneLandscapeLayoutSummary {
  type: 'one-on-one-landscape';
  spotlight: string;
  pip: string;
}

export interface OneOnOnePortraitLayoutSummary {
  type: 'one-on-one-portrait';
  spotlight: string[];
  pip?: string;
  pipSize: 'sm' | 'lg';
}

export interface PipLayoutSummary {
  type: 'pip';
  spotlight: string[];
}

export type LayoutSummary =
  | GridLayoutSummary
  | SpotlightLandscapeLayoutSummary
  | SpotlightPortraitLayoutSummary
  | SpotlightExpandedLayoutSummary
  | OneOnOneLandscapeLayoutSummary
  | OneOnOnePortraitLayoutSummary
  | PipLayoutSummary;

function summarizeLayout$(l$: Observable<Layout>): Observable<LayoutSummary> {
  return l$.pipe(
    switchMap((l) => {
      switch (l.type) {
        case 'grid':
          return combineLatest(
            [l.spotlight?.media$ ?? constant(undefined), ...l.grid.map((vm) => vm.media$)],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight?.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            })
          );
        case 'spotlight-landscape':
        case 'spotlight-portrait':
          return combineLatest(
            [l.spotlight.media$, ...l.grid.map((vm) => vm.media$)],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            })
          );
        case 'spotlight-expanded':
          return combineLatest(
            [l.spotlight.media$, l.pip?.media$ ?? constant(undefined)],
            (spotlight, pip) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
            })
          );
        case 'one-on-one-landscape':
          return combineLatest([l.spotlight.media$, l.pip.media$], (spotlight, pip) => ({
            type: l.type,
            spotlight: spotlight.id,
            pip: pip.id,
          }));
        case 'one-on-one-portrait':
          return combineLatest(
            [l.spotlight.media$, l.pip?.media$ ?? constant(undefined), l.pipSize$],
            (spotlight, pip, pipSize) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
              pipSize,
            })
          );
        case 'pip':
          return l.spotlight.media$.pipe(
            map((spotlight) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
            }))
          );
      }
    }),
    // Sometimes there can be multiple (synchronous) updates per frame. We only
    // care about the most recent value for each time step, so discard these
    // extra values.
    debounceTime(0),
    distinctUntilChanged(deepCompare)
  );
}

describe.each([[MatrixRTCMode.Legacy], [MatrixRTCMode.Compatibility], [MatrixRTCMode.Matrix_2_0]])(
  'CallViewModel (%s mode)',
  (mode) => {
    const withCallViewModel = withCallViewModelInMode(mode);

    test('participantActivity$ reports who is speaking from the participants themselves', () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        // Alice speaks on frame 1 and stops on frame 2; Bob speaks from frame 3
        const aliceSpeakingInputMarbles = 'nyn-';
        const bobSpeakingInputMarbles = '   nnny';
        const expectedMarbles = '          abac';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant, bobParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
            speaking: new Map([
              [aliceParticipant, behavior(aliceSpeakingInputMarbles, yesNo)],
              [bobParticipant, behavior(bobSpeakingInputMarbles, yesNo)],
            ]),
          },
          (vm) => {
            expectObservable(
              vm.participantActivity$.pipe(map((activity) => [...activity.speaking].sort()))
            ).toBe(expectedMarbles, {
              a: [],
              b: [alice.userId],
              c: [bob.userId],
            });
          }
        );
      });
    });

    test('participants are retained during a focus switch', () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        // Participants disappear on frame 2 and come back on frame 3
        const participantInputMarbles = 'a-ba';
        // Start switching focus on frame 1 and reconnect on frame 3
        const connectionInputMarbles = ' cs-c';
        // The visible participants should remain the same throughout the switch
        const expectedLayoutMarbles = '  a';

        withCallViewModel(
          {
            remoteParticipants$: behavior(participantInputMarbles, {
              a: [aliceParticipant, bobParticipant],
              b: [],
            }),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
            livekitConnectionState$: behavior(connectionInputMarbles, {
              c: ConnectionState.Connected,
              s: ConnectionState.Connecting,
            }),
          },
          (vm) => {
            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${aliceId}`, `${bobId}`],
              },
            });
          }
        );
      });
    });

    test('one-on-one portrait layout shows local tile when video is enabled', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        // Local participant enables their video, then disables it
        const videoInputMarbles = '    ny--n';
        // While tile is shown, tap the screen twice
        const tapScreenInputMarbles = '--aa-';
        // Layout should show local tile, make it small, enlarge it again, then hide it
        const expectedLayoutMarbles = 'abcba';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant]),
            roomMembers: [local, alice],
            rtcMembers$: constant([localRtcMember, aliceRtcMember]),
            videoEnabled: new Map([[localParticipant, behavior(videoInputMarbles, yesNo)]]),
            windowSize$: constant({ width: 380, height: 700 }), // Mobile phone in portrait
          },
          (vm) => {
            schedule(tapScreenInputMarbles, { a: () => vm.tapScreen() });

            expectObservable(vm.edgeToEdge$).toBe('y', yesNo); // Edge-to-edge-layout
            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'one-on-one-portrait',
                spotlight: [`${aliceId}`],
                pip: undefined,
                pipSize: 'lg',
              },
              b: {
                type: 'one-on-one-portrait',
                spotlight: [`${aliceId}`],
                pip: `${localId}`,
                pipSize: 'lg',
              },
              c: {
                type: 'one-on-one-portrait',
                spotlight: [`${aliceId}`],
                pip: `${localId}`,
                pipSize: 'sm',
              },
            });
          }
        );
      });
    });

    test('one-on-one portrait layout shows name tags in room with 3 members', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant]),
            // Both Alice and Bob are with us in the room
            roomMembers: [local, alice, bob],
            rtcMembers$: constant([localRtcMember, aliceRtcMember]),
            windowSize$: constant({ width: 380, height: 700 }), // Mobile phone in portrait
          },
          (vm) => {
            // Uses one-on-one portrait layout
            expectObservable(summarizeLayout$(vm.layout$)).toBe('a', {
              a: {
                type: 'one-on-one-portrait',
                spotlight: [`${aliceId}`],
                pip: undefined,
                pipSize: 'lg',
              },
            });
            // It wouldn't be clear whether Alice or Bob is the remote video tile,
            // so the interface must put a name tag on it
            expectObservable(vm.showNameTags$).toBe('y', yesNo);
          }
        );
      });
    });

    test('participants stay in the same order unless to appear/disappear', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        const visibilityInputMarbles = 'a';
        // First Bob speaks, then Dave, then Alice
        const aSpeakingInputMarbles = ' n- 1998ms - 1999ms y';
        const bSpeakingInputMarbles = ' ny 1998ms n 1999ms -';
        const dSpeakingInputMarbles = ' n- 1998ms y 1999ms n';
        // Nothing should change when Bob speaks, because Bob is already on screen.
        // When Dave speaks he should switch with Alice because she's the one who
        // hasn't spoken at all. Then when Alice speaks, she should return to her
        // place at the top.
        const expectedLayoutMarbles = ' a  1999ms b 1999ms a 57999ms c 1999ms a';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant, bobParticipant, daveParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember, daveRtcMember]),
            speaking: new Map([
              [aliceParticipant, behavior(aSpeakingInputMarbles, yesNo)],
              [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
              [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
            ]),
          },
          (vm) => {
            schedule(visibilityInputMarbles, {
              a: () => {
                // We imagine that only three tiles (the first three) will be visible
                // on screen at a time
                vm.layout$.subscribe((layout) => {
                  if (layout.type === 'grid') layout.setVisibleTiles(3);
                });
              },
            });

            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${aliceId}`, `${bobId}`, `${daveId}`],
              },
              b: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${daveId}`, `${bobId}`, `${aliceId}`],
              },
              c: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${aliceId}`, `${daveId}`, `${bobId}`],
              },
            });
          }
        );
      });
    });

    test('participants adjust order when space becomes constrained', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        // Start with all tiles on screen then shrink to 3
        const visibilityInputMarbles = 'a-b';
        // Bob and Dave speak
        const bSpeakingInputMarbles = ' ny';
        const dSpeakingInputMarbles = ' ny';
        // Nothing should change when Bob or Dave initially speak, because they are
        // on screen. When the screen becomes smaller Alice should move off screen
        // to make way for the speakers (specifically, she should swap with Dave).
        const expectedLayoutMarbles = ' a-b';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant, bobParticipant, daveParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember, daveRtcMember]),
            speaking: new Map([
              [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
              [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
            ]),
          },
          (vm) => {
            let setVisibleTiles: ((value: number) => void) | null = null;
            vm.layout$.subscribe((layout) => {
              if (layout.type === 'grid') setVisibleTiles = layout.setVisibleTiles;
            });
            schedule(visibilityInputMarbles, {
              a: () => setVisibleTiles!(Infinity),
              b: () => setVisibleTiles!(3),
            });

            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${aliceId}`, `${bobId}`, `${daveId}`],
              },
              b: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, `${daveId}`, `${bobId}`, `${aliceId}`],
              },
            });
          }
        );
      });
    });

    test('PiP tile in expanded spotlight layout switches speakers without layout shifts', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        // Switch to spotlight immediately
        const modeInputMarbles = '     s';
        // And expand the spotlight immediately
        const expandInputMarbles = '   a';
        // First Bob speaks, then Dave, then Bob again
        const bSpeakingInputMarbles = 'n-yn--yn';
        const dSpeakingInputMarbles = 'n---yn';
        // Should show Alice (presenter) in the PiP, then Bob, then Dave, then Bob
        // again
        const expectedLayoutMarbles = 'a-b-c-b';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant, bobParticipant, daveParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember, daveRtcMember]),
            speaking: new Map([
              [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
              [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
            ]),
            sharingScreen: new Map([[aliceParticipant, constant(true)]]),
          },
          (vm) => {
            schedule(modeInputMarbles, {
              s: () => vm.setGridMode('spotlight'),
            });
            schedule(expandInputMarbles, {
              a: () => vm.toggleSpotlightExpanded$.value!(),
            });

            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'spotlight-expanded',
                spotlight: [`${aliceId}:screen-share`],
                pip: `${aliceId}`,
              },
              b: {
                type: 'spotlight-expanded',
                spotlight: [`${aliceId}:screen-share`],
                pip: `${bobId}`,
              },
              c: {
                type: 'spotlight-expanded',
                spotlight: [`${aliceId}:screen-share`],
                pip: `${daveId}`,
              },
            });

            // While we expect the media on the PiP tile to change, layout$ itself
            // should *never* meaningfully change. That is, we expect the same PiP
            // tile to exist throughout the test and just have its media swapped out
            // when the speaker changes, rather than for tiles to animate in/out.
            // This is meaningful for keeping the interface not too visually
            // distracting during back-and-forth conversations.
            expectObservable(
              vm.layout$.pipe(
                distinctUntilChanged(deepCompare),
                debounceTime(0),
                map(() => 'x')
              )
            ).toBe('x'); // Expect just one emission
          }
        );
      });
    });

    test('PiP tile in expanded spotlight layout avoids redundantly showing local user', () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        // Switch to spotlight immediately
        const modeInputMarbles = '       s';
        // And expand the spotlight immediately
        const expandInputMarbles = '     a';
        // First no one else is in the call, then Alice joins
        const participantInputMarbles = 'ab';
        // First local user should be in the spotlight, then they appear in PiP
        // only once Alice has joined
        const expectedLayoutMarbles = '  ab';

        withCallViewModel(
          {
            rtcMembers$: behavior(participantInputMarbles, {
              a: [localRtcMember],
              b: [localRtcMember, aliceRtcMember],
            }),
          },
          (vm) => {
            schedule(modeInputMarbles, {
              s: () => vm.setGridMode('spotlight'),
            });
            schedule(expandInputMarbles, {
              a: () => vm.toggleSpotlightExpanded$.value!(),
            });

            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'spotlight-expanded',
                spotlight: [`${localId}`],
                pip: undefined,
              },
              b: {
                type: 'spotlight-expanded',
                spotlight: [`${aliceId}`],
                pip: `${localId}`,
              },
            });
          }
        );
      });
    });

    it('should rank raised hands above video feeds and below speakers and presenters', () => {
      withTestScheduler(({ schedule, expectObservable }) => {
        // There should always be one tile for each MatrixRTCSession
        const expectedLayoutMarbles = 'ab';

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant, bobParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
          },
          (vm, _rtcSession, { raisedHands$ }) => {
            schedule('ab', {
              a: () => {
                // We imagine that only two tiles (the first two) will be visible on screen at a time
                vm.layout$.subscribe((layout) => {
                  if (layout.type === 'grid') {
                    layout.setVisibleTiles(2);
                  }
                });
              },
              b: () => {
                raisedHands$.next({
                  [`${bobRtcMember.userId}:${bobRtcMember.deviceId}`]: {
                    time: new Date(),
                    reactionEventId: '',
                    membershipEventId: '',
                  },
                });
              },
            });
            expectObservable(summarizeLayout$(vm.layout$)).toBe(expectedLayoutMarbles, {
              a: {
                type: 'grid',
                spotlight: undefined,
                grid: [`${localId}`, '@alice:example.org:AAAA', '@bob:example.org:BBBB'],
              },
              b: {
                type: 'grid',
                spotlight: undefined,
                grid: [
                  `${localId}`,
                  // Bob shifts up!
                  '@bob:example.org:BBBB',
                  '@alice:example.org:AAAA',
                ],
              },
            });
          }
        );
      });
    });

    function nooneEverThere$<T>(
      behavior: (marbles: string, values: Record<string, T[]>) => Behavior<T[]>
    ): Behavior<T[]> {
      return behavior('a-b-c-d', {
        a: [], // Start empty
        b: [], // Alice joins
        c: [], // Alice still there
        d: [], // Alice leaves
      });
    }

    function participantJoinLeave$(
      behavior: (
        marbles: string,
        values: Record<string, RemoteParticipant[]>
      ) => Behavior<RemoteParticipant[]>
    ): Behavior<RemoteParticipant[]> {
      return behavior('a-b-c-d', {
        a: [], // Start empty
        b: [aliceParticipant], // Alice joins
        c: [aliceParticipant], // Alice still there
        d: [], // Alice leaves
      });
    }

    function rtcMemberJoinLeave$(
      behavior: (
        marbles: string,
        values: Record<string, CallMembership[]>
      ) => Behavior<CallMembership[]>
    ): Behavior<CallMembership[]> {
      return behavior('a-b-c-d', {
        a: [localRtcMember], // Start empty
        b: [localRtcMember, aliceRtcMember], // Alice joins
        c: [localRtcMember, aliceRtcMember], // Alice still there
        d: [localRtcMember], // Alice leaves
      });
    }

    test('autoLeave$ emits only when autoLeaveWhenOthersLeft option is enabled', () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        withCallViewModel(
          {
            remoteParticipants$: participantJoinLeave$(behavior),
            rtcMembers$: rtcMemberJoinLeave$(behavior),
          },
          (vm) => {
            expectObservable(vm.autoLeave$).toBe('------ 30s a', {
              a: 'allOthersLeft',
            });
          },
          {
            autoLeaveWhenOthersLeft: true,
            encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
          }
        );
      });
    });

    test('autoLeave$ never emits autoLeaveWhenOthersLeft option is enabled but no-one is there', () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        withCallViewModel(
          {
            remoteParticipants$: nooneEverThere$(behavior),
            rtcMembers$: nooneEverThere$(behavior),
          },
          (vm) => {
            expectObservable(vm.autoLeave$).toBe('-');
          },
          {
            autoLeaveWhenOthersLeft: true,
            encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
          }
        );
      });
    });

    test("autoLeave$ doesn't emit when autoLeaveWhenOthersLeft option is disabled and all others left", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        withCallViewModel(
          {
            remoteParticipants$: participantJoinLeave$(behavior),
            rtcMembers$: rtcMemberJoinLeave$(behavior),
          },
          (vm) => {
            expectObservable(vm.autoLeave$).toBe('-');
          },
          {
            autoLeaveWhenOthersLeft: false,
            encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
          }
        );
      });
    });

    test('autoLeave$ emits when autoLeaveWhenOthersLeft option is enabled and all others left', () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        withCallViewModel(
          {
            remoteParticipants$: behavior('a-b-c-d', {
              a: [], // Alone
              b: [aliceParticipant], // Alice joins
              c: [aliceParticipant],
              d: [], // Local joins with a second device
            }),
            rtcMembers$: behavior('a-b-c-d', {
              a: [localRtcMember], // Start empty
              b: [localRtcMember, aliceRtcMember], // Alice joins
              c: [localRtcMember, aliceRtcMember, localRtcMemberDevice2], // Alice still there
              d: [localRtcMember, localRtcMemberDevice2], // The second Alice leaves
            }),
          },
          (vm) => {
            expectObservable(vm.autoLeave$).toBe('------ 30s a', {
              a: 'allOthersLeft',
            });
          },
          {
            autoLeaveWhenOthersLeft: true,
            encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
          }
        );
      });
    });

    it.skip('media tracks are paused while reconnecting to MatrixRTC', () => {
      withTestScheduler(({ schedule, expectObservable }) => {
        const trackRunning$ = new BehaviorSubject(true);
        const originalPublications = localParticipant.trackPublications;
        localParticipant.trackPublications = new Map([
          [
            'video',
            {
              track: new (class {
                public get isUpstreamPaused(): boolean {
                  return !trackRunning$.value;
                }
                public async pauseUpstream(): Promise<void> {
                  trackRunning$.next(false);
                  return Promise.resolve();
                }
                public async resumeUpstream(): Promise<void> {
                  trackRunning$.next(true);
                  return Promise.resolve();
                }
              })(),
            } as unknown as LocalTrackPublication,
          ],
        ]);
        onTestFinished(() => {
          localParticipant.trackPublications = originalPublications;
        });

        // There are three indicators that the client might be disconnected from
        // MatrixRTC: whether the sync loop is connected, whether the membership is
        // present in local room state, and whether the membership manager thinks
        // we've hit the timeout for the delayed leave event. Let's test all
        // combinations of these conditions.
        const syncingMarbles = '             nyny----n--y';
        const membershipStatusMarbles = '    y---ny-n-yn-y';
        const probablyLeftMarbles = '        n-----y-ny---n';
        const expectedReconnectingMarbles = 'n-ynyny------n';
        const expectedTrackRunningMarbles = 'nynynyn------y';

        withCallViewModel(
          { initialSyncState: SyncState.Reconnecting },
          (vm, rtcSession, _subjects, setSyncState) => {
            schedule(syncingMarbles, {
              y: () => setSyncState(SyncState.Syncing),
              n: () => setSyncState(SyncState.Reconnecting),
            });
            schedule(membershipStatusMarbles, {
              y: () => {
                rtcSession.membershipStatus = Status.Connected;
              },
            });
            schedule(probablyLeftMarbles, {
              y: () => {
                rtcSession.probablyLeft = true;
              },
              n: () => {
                rtcSession.probablyLeft = false;
              },
            });
            expectObservable(vm.reconnecting$).toBe(expectedReconnectingMarbles, yesNo);
            expectObservable(trackRunning$).toBe(expectedTrackRunningMarbles, yesNo);
          }
        );
      });
    });
  }
);

// A stand-in for a running call, enough for CallStage to render: fixed layouts and fake
// participants (some with a canvas "camera"), no Matrix or LiveKit behind them.
import { BehaviorSubject } from 'rxjs';
import { type TrackReference } from '@livekit/components-core';

import { type Call } from '../../src/app/plugins/call/Call';
import {
  GridTileViewModel,
  SpotlightTileViewModel,
} from '../../src/app/plugins/call/engine/state/TileViewModel';
import { type Layout } from '../../src/app/plugins/call/engine/state/layout-types';
import { type MediaViewModel } from '../../src/app/plugins/call/engine/state/media/MediaViewModel';
import { type UserMediaViewModel } from '../../src/app/plugins/call/engine/state/media/UserMediaViewModel';
import { type ScreenShareViewModel } from '../../src/app/plugins/call/engine/state/media/ScreenShareViewModel';
import { naturalWindowMode } from '../../src/app/plugins/call/engine/state/CallViewModel/windowMode';

const b = <T>(value: T): BehaviorSubject<T> => new BehaviorSubject(value);

const NAMES = ['You', 'Ada', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia'];

/** A canvas animation as a video track: a gradient for cameras, text lines for a screen. */
function fakeVideo(kind: 'camera' | 'screen', seed: number): TrackReference {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'screen' ? 1280 : 640;
  canvas.height = kind === 'screen' ? 720 : 360;
  const ctx = canvas.getContext('2d')!;
  const draw = (): void => {
    if (kind === 'screen') {
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = ['#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7'][(i + seed) % 4];
        ctx.fillRect(60 + (i % 3) * 30, 40 + i * 28, 200 + ((i * 97 + seed * 31) % 700), 14);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, `hsl(${(seed * 67) % 360} 60% 45%)`);
      g.addColorStop(1, `hsl(${(seed * 67 + 120) % 360} 60% 25%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height * 0.45, canvas.height * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(canvas.width / 2 - 110, canvas.height * 0.68, 220, canvas.height);
    }
  };
  draw();
  const stream = canvas.captureStream(5);
  const track = {
    attach: (el: HTMLMediaElement) => {
      el.srcObject = stream;
      el.play().catch(() => undefined);
      return el;
    },
    detach: (el: HTMLMediaElement) => {
      el.srcObject = null;
      return el;
    },
  };
  const participant = {
    on: () => undefined,
    off: () => undefined,
    getTrackPublication: () => undefined,
  };
  return { participant, publication: { track }, source: kind } as unknown as TrackReference;
}

export interface Participant {
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
  handRaised?: boolean;
  camera?: boolean;
}

function userMedia(i: number, p: Participant): UserMediaViewModel {
  return {
    type: 'user',
    local: i === 0,
    id: `user-${i}`,
    userId: `@user${i}:example.org`,
    displayName$: b(NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : '')),
    mxcAvatarUrl$: b(undefined),
    video$: b(p.camera ? fakeVideo('camera', i) : undefined),
    focusUrl$: b(undefined),
    unencryptedWarning$: b(false),
    speaking$: b(p.speaking ?? false),
    audioEnabled$: b(!p.muted),
    deafened$: b(p.deafened ?? false),
    videoEnabled$: b(p.camera ?? false),
    videoFit$: b('cover'),
    toggleCropVideo: () => undefined,
    rtcBackendIdentity: `identity-${i}`,
    handRaised$: b(p.handRaised ? new Date() : null),
    reaction$: b(null),
    setTargetDimensions: () => undefined,
    mirror$: b(false),
    alwaysShow$: b(true),
    setAlwaysShow: () => undefined,
    switchCamera$: b(null),
    waitingForMedia$: b(false),
  } as unknown as UserMediaViewModel;
}

function screenShare(i: number): ScreenShareViewModel {
  return {
    type: 'screen share',
    local: false,
    id: `share-${i}`,
    userId: `@user${i}:example.org`,
    displayName$: b(NAMES[i % NAMES.length]),
    mxcAvatarUrl$: b(undefined),
    video$: b(fakeVideo('screen', i)),
    focusUrl$: b(undefined),
    unencryptedWarning$: b(false),
    videoEnabled$: b(true),
    audioEnabled$: b(true),
    playbackMuted$: b(false),
    playbackVolume$: b(1),
    togglePlaybackMuted: () => undefined,
    adjustPlaybackVolume: () => undefined,
    commitPlaybackVolume: () => undefined,
  } as unknown as ScreenShareViewModel;
}

export interface Scenario {
  /** A fixed layout, or `auto`: picked for the stage's size like the view model does. */
  layout: string;
  tiles: number;
  /** How many screen shares there are; they lead the spotlight. */
  shares: number;
  /** Two items in the spotlight, so it shows its page indicators. */
  indicators: boolean;
  /** Give participants states and cameras, for screenshots. */
  rich: boolean;
  reconnecting: boolean;
  /** Tile indices whose media cannot be decrypted. */
  undecryptable: number[];
  /** Every participant is speaking and has a camera, to check the speaking ring. */
  everyoneSpeaks: boolean;
}

const richStates: Participant[] = [
  { camera: true },
  { speaking: true },
  { muted: true },
  { deafened: true },
  { handRaised: true },
  { camera: true, speaking: true },
  { muted: true },
  {},
  { camera: true },
];

export function fakeCall(s: Scenario): Call {
  const people = Array.from({ length: s.tiles }, (_, i) =>
    userMedia(
      i,
      s.everyoneSpeaks
        ? { camera: true, speaking: true }
        : s.rich
          ? richStates[i % richStates.length]
          : {}
    )
  );
  const shares = Array.from({ length: s.shares }, (_, i) => screenShare(i + 1));
  const grid = people.map((m) => new GridTileViewModel(b(m)));
  const spotlightMedia: MediaViewModel[] =
    shares.length > 0 ? shares : people.slice(0, s.indicators ? 2 : 1);
  const spotlight = new SpotlightTileViewModel(b(spotlightMedia), b(false));
  const alignment$ = b({ block: 'end' as const, inline: 'end' as const });
  // Like the view model: a new visible tile count rebuilds the layout.
  let lastVisible = 0;
  const setVisibleTiles = (n: number): void => {
    if (n === lastVisible) return;
    lastVisible = n;
    layout$.next({ ...layout$.value });
  };

  const layouts: Record<string, unknown> = {
    grid: {
      type: 'grid',
      spotlight: undefined,
      grid,
      spotlightAlignment$: alignment$,
      setVisibleTiles,
    },
    'spotlight-portrait': { type: 'spotlight-portrait', spotlight, grid, setVisibleTiles },
    'spotlight-landscape': { type: 'spotlight-landscape', spotlight, grid, setVisibleTiles },
    'one-on-one-landscape': {
      type: 'one-on-one-landscape',
      spotlight: grid[0],
      pip: grid[1] ?? grid[0],
      pipAlignment$: alignment$,
    },
    pip: { type: 'pip', spotlight },
  };
  // The view model's choice for a group call: remote screen shares go in the spotlight.
  const autoLayout = (size: { width: number; height: number }): string => {
    switch (naturalWindowMode(size)) {
      case 'pip':
        return 'pip';
      case 'narrow':
        return shares.length > 0 || people.length > 3 ? 'spotlight-portrait' : 'grid';
      default:
        return shares.length > 0 ? 'spotlight-landscape' : 'grid';
    }
  };
  const auto = s.layout === 'auto';
  const initial = auto
    ? autoLayout({ width: window.innerWidth, height: window.innerHeight })
    : s.layout;
  const layout$ = b(layouts[initial] as Layout);

  const vm = {
    layout$,
    edgeToEdge$: b(false),
    showNameTags$: b(true),
    reconnecting$: b(s.reconnecting),
    screenShares$: b(shares),
    userMedia$: b(people),
    focusedMediaId$: b<string | null>(null),
    focusMedia: () => undefined,
    showGrid: () => undefined,
    tapScreen: () => undefined,
    hoverScreen: () => undefined,
    unhoverScreen: () => undefined,
    spotlightExpanded$: b(false),
    showSpotlightIndicators$: b(s.layout !== 'grid'),
    showSpeakingIndicators$: b(true),
    visibleReactions$: b(s.rich ? [{ sender: 'user-2', emoji: '🎉', startX: 30 }] : []),
  };
  return {
    vm,
    roomId: '!room:example.org',
    hangup: () => console.info('hangup'),
    undecryptable$: b(new Set(s.undecryptable.map((i) => `identity-${i}`))),
    muteStates: { audio: { setEnabled$: b(null) } },
    toggleMicrophone: () => undefined,
    toggleVideo: () => undefined,
    setViewSize: (width: number, height: number): void => {
      if (!auto) return;
      const next = layouts[autoLayout({ width, height })] as Layout;
      if (next !== layout$.value && next.type !== layout$.value.type) layout$.next(next);
    },
  } as unknown as Call;
}

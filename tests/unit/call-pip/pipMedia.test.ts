import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import {
  pickPipMedia,
  pipHasVideo,
  type PipShare,
  type PipUser,
} from '../../../src/app/features/call-pip/pipMedia';
import {
  observePipMedia$,
  type PipSelection,
  type PipShareMedia,
  type PipUserMedia,
} from '../../../src/app/features/call-pip/observePipMedia';

const user = (id: string, extra: Partial<PipUser> = {}): PipUser => ({
  id,
  local: false,
  videoEnabled: false,
  speakingSince: null,
  ...extra,
});
const share = (id: string, local = false): PipShare => ({ id, local });
const pick = (input: Partial<Parameters<typeof pickPipMedia>[0]>) =>
  pickPipMedia({ focusedId: null, users: [], shares: [], previousId: null, ...input });

describe('pipHasVideo', () => {
  it('needs a camera on (yours counts) or a screen share', () => {
    expect(pipHasVideo([user('a'), user('me', { local: true })], [])).toBe(false);
    expect(pipHasVideo([user('a', { videoEnabled: true })], [])).toBe(true);
    expect(pipHasVideo([user('me', { local: true, videoEnabled: true })], [])).toBe(true);
    expect(pipHasVideo([user('a')], [share('s')])).toBe(true);
  });
});

describe('pickPipMedia', () => {
  it('shows nothing when nothing has video', () => {
    expect(pick({ users: [user('a'), user('me', { local: true })] })).toBeNull();
  });

  it('prefers what the user focused, when it has video', () => {
    const users = [
      user('a', { videoEnabled: true, speakingSince: 5 }),
      user('b', { videoEnabled: true }),
    ];
    expect(pick({ focusedId: 'b', users, shares: [share('s')] })).toBe('b');
    expect(pick({ focusedId: 's', users, shares: [share('s')] })).toBe('s');
  });

  it('ignores a focused person whose camera is off', () => {
    const users = [user('a'), user('b', { videoEnabled: true })];
    expect(pick({ focusedId: 'a', users })).toBe('b');
  });

  it('prefers a screen share from someone else, the newest', () => {
    const users = [user('a', { videoEnabled: true, speakingSince: 5 })];
    expect(pick({ users, shares: [share('old'), share('new')] })).toBe('new');
    expect(pick({ users, shares: [share('mine', true), share('theirs')] })).toBe('theirs');
  });

  it('follows whoever began speaking most recently among the others with a camera', () => {
    const users = [
      user('a', { videoEnabled: true, speakingSince: 100 }),
      user('b', { videoEnabled: true, speakingSince: 300 }),
      user('c', { videoEnabled: true, speakingSince: null }),
      user('d', { speakingSince: 900 }), // speaking but no camera
    ];
    expect(pick({ users })).toBe('b');
  });

  it('keeps the previous choice while nobody is speaking, if it is still eligible', () => {
    const users = [user('a', { videoEnabled: true }), user('b', { videoEnabled: true })];
    expect(pick({ users, previousId: 'b' })).toBe('b');
    expect(pick({ users, previousId: 'gone' })).toBe('a');
  });

  it('falls back to your own camera, then your own screen share', () => {
    const me = user('me', { local: true, videoEnabled: true });
    expect(pick({ users: [me, user('a')] })).toBe('me');
    expect(
      pick({ users: [user('me', { local: true }), user('a')], shares: [share('mine', true)] })
    ).toBe('mine');
  });
});

describe('observePipMedia$', () => {
  interface TestUser extends PipUserMedia {
    video: BehaviorSubject<boolean>;
    speaking: BehaviorSubject<boolean>;
  }
  const makeUser = (id: string, local = false, video = false): TestUser => {
    const v = new BehaviorSubject(video);
    const s = new BehaviorSubject(false);
    return { id, local, videoEnabled$: v, speaking$: s, video: v, speaking: s };
  };

  const setup = (users: TestUser[], shares: PipShareMedia[] = []) => {
    const userMedia$ = new BehaviorSubject(users);
    const screenShares$ = new BehaviorSubject(shares);
    const focusedMediaId$ = new BehaviorSubject<string | null>(null);
    let clock = 1000;
    const seen: PipSelection<TestUser, PipShareMedia>[] = [];
    const subscription = observePipMedia$(
      { userMedia$, screenShares$, focusedMediaId$ },
      () => clock
    ).subscribe((s) => seen.push(s));
    return {
      userMedia$,
      screenShares$,
      focusedMediaId$,
      seen,
      tick: (ms: number) => {
        clock += ms;
      },
      last: () => seen[seen.length - 1],
      stop: () => subscription.unsubscribe(),
    };
  };

  it('has nothing to show until somebody turns a camera on', () => {
    const a = makeUser('a');
    const t = setup([makeUser('me', true), a]);
    expect(t.last()).toEqual({ media: null, hasVideo: false });
    a.video.next(true);
    expect(t.last().media).toBe(a);
    expect(t.last().hasVideo).toBe(true);
    a.video.next(false);
    expect(t.last()).toEqual({ media: null, hasVideo: false });
    t.stop();
  });

  it('switches to the person who started speaking last', () => {
    const a = makeUser('a', false, true);
    const b = makeUser('b', false, true);
    const t = setup([a, b]);
    expect(t.last().media).toBe(a);
    b.speaking.next(true);
    expect(t.last().media).toBe(b);
    t.tick(500);
    a.speaking.next(true);
    expect(t.last().media).toBe(a);
    a.speaking.next(false);
    // b is still speaking, so b is next.
    expect(t.last().media).toBe(b);
    t.stop();
  });

  it('stays on the last choice when everyone goes quiet', () => {
    const a = makeUser('a', false, true);
    const b = makeUser('b', false, true);
    const t = setup([a, b]);
    b.speaking.next(true);
    b.speaking.next(false);
    expect(t.last().media).toBe(b);
    t.stop();
  });

  it('shows a focused person or a screen share over speakers', () => {
    const a = makeUser('a', false, true);
    const b = makeUser('b', false, true);
    const stream: PipShareMedia = { id: 'a:share', local: false };
    const t = setup([a, b]);
    t.focusedMediaId$.next('b');
    a.speaking.next(true);
    expect(t.last().media).toBe(b);
    t.focusedMediaId$.next(null);
    expect(t.last().media).toBe(a);
    t.screenShares$.next([stream]);
    expect(t.last().media).toBe(stream);
    t.stop();
  });

  it('emits only when the choice changes', () => {
    const a = makeUser('a', false, true);
    const t = setup([a]);
    const before = t.seen.length;
    a.speaking.next(true);
    a.speaking.next(false);
    expect(t.seen.length).toBe(before);
    t.stop();
  });
});

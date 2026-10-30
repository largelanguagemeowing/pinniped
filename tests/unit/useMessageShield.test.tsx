import React from 'react';
import { EventEmitter } from 'node:events';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventShieldColour, EventShieldReason } from 'matrix-js-sdk/lib/crypto-api';
import { useMessageShield } from '../../src/app/hooks/useMessageShield';
import { MessageShield } from '../../src/app/utils/messageShield';

const state = vi.hoisted(() => ({ mx: undefined as unknown }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => state.mx }));

type Info = { shieldColour: EventShieldColour; shieldReason: EventShieldReason | null } | null;

const makeClient = (lookup: (() => Promise<Info>) | undefined) => {
  const mx = new EventEmitter() as EventEmitter & Record<string, unknown>;
  mx.setMaxListeners(500);
  const getEncryptionInfoForEvent = vi.fn(lookup ?? (async () => null));
  mx.getCrypto = () => ({ getEncryptionInfoForEvent });
  return { mx, getEncryptionInfoForEvent };
};

const makeEvent = (opts: { encrypted?: boolean; failed?: boolean } = {}) => {
  const event = new EventEmitter() as EventEmitter & Record<string, unknown>;
  event.isEncrypted = () => opts.encrypted ?? true;
  event.isDecryptionFailure = () => opts.failed ?? false;
  return event;
};

const unsigned: Info = {
  shieldColour: EventShieldColour.RED,
  shieldReason: EventShieldReason.UNSIGNED_DEVICE,
};
const none: Info = { shieldColour: EventShieldColour.NONE, shieldReason: null };

describe('useMessageShield', () => {
  let renderers: ReactTestRenderer[] = [];
  let seen: MessageShield | null | undefined;

  const Probe = ({ event }: { event: never }) => {
    seen = useMessageShield(event);
    return null;
  };
  const mount = async (event: unknown) => {
    await act(async () => {
      renderers.push(create(<Probe event={event as never} />));
    });
  };
  const flush = () => act(async () => {});

  afterEach(() => {
    act(() => renderers.forEach((r) => r.unmount()));
    renderers = [];
    seen = undefined;
  });

  it('warns about a message from a device its owner has not verified', async () => {
    const { mx } = makeClient(async () => unsigned);
    state.mx = mx;
    await mount(makeEvent());
    expect(seen?.colour).toBe('red');
    expect(seen?.text).toContain('device its owner has not verified');
  });

  it('shows nothing when the SDK has no concern', async () => {
    const { mx } = makeClient(async () => none);
    state.mx = mx;
    await mount(makeEvent());
    expect(seen).toBeNull();
  });

  it('does not ask about messages that are not encrypted', async () => {
    const { mx, getEncryptionInfoForEvent } = makeClient(async () => unsigned);
    state.mx = mx;
    await mount(makeEvent({ encrypted: false }));
    expect(seen).toBeNull();
    expect(getEncryptionInfoForEvent).not.toHaveBeenCalled();
  });

  it('does not ask about a message that failed to decrypt', async () => {
    const { mx, getEncryptionInfoForEvent } = makeClient(async () => unsigned);
    state.mx = mx;
    await mount(makeEvent({ failed: true }));
    expect(seen).toBeNull();
    expect(getEncryptionInfoForEvent).not.toHaveBeenCalled();
  });

  it('shows nothing when the lookup fails, rather than a wrong warning', async () => {
    const { mx } = makeClient(async () => {
      throw new Error('crypto not ready');
    });
    state.mx = mx;
    await mount(makeEvent());
    expect(seen).toBeNull();
  });

  it('looks again when trust or the device list changes', async () => {
    let answer: Info = none;
    const { mx, getEncryptionInfoForEvent } = makeClient(async () => answer);
    state.mx = mx;
    await mount(makeEvent());
    expect(seen).toBeNull();

    // a new, unverified device appears on the sender's account
    answer = unsigned;
    act(() => {
      mx.emit('crypto.devicesUpdated', ['@them:x'], false);
    });
    await flush();
    expect(seen?.colour).toBe('red');

    // and the owner verifies it
    answer = none;
    act(() => {
      mx.emit('userTrustStatusChanged', '@them:x', {});
    });
    await flush();
    expect(seen).toBeNull();
    expect(getEncryptionInfoForEvent).toHaveBeenCalledTimes(3);
  });

  it('looks again once a message finishes decrypting', async () => {
    let answer: Info = null;
    const { mx } = makeClient(async () => answer);
    state.mx = mx;
    const event = makeEvent();
    await mount(event);
    expect(seen).toBeNull();

    answer = unsigned;
    act(() => {
      event.emit('Event.decrypted');
    });
    await flush();
    expect(seen?.colour).toBe('red');
  });

  it('uses one client listener for any number of messages, and releases it', async () => {
    const { mx } = makeClient(async () => none);
    state.mx = mx;
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mount(makeEvent());
    }
    expect(mx.listenerCount('crypto.devicesUpdated')).toBe(1);
    expect(mx.listenerCount('userTrustStatusChanged')).toBe(1);

    act(() => renderers.forEach((r) => r.unmount()));
    renderers = [];
    expect(mx.listenerCount('crypto.devicesUpdated')).toBe(0);
    expect(mx.listenerCount('userTrustStatusChanged')).toBe(0);
  });

  it('stops listening to a message once it is no longer shown', async () => {
    const { mx } = makeClient(async () => none);
    state.mx = mx;
    const event = makeEvent();
    await mount(event);
    expect(event.listenerCount('Event.decrypted')).toBe(1);

    act(() => renderers.forEach((r) => r.unmount()));
    renderers = [];
    expect(event.listenerCount('Event.decrypted')).toBe(0);
  });
});

import React from 'react';
import { EventEmitter } from 'events';
import { act, create, ReactTestInstance } from 'react-test-renderer';
import { VerificationPhase } from 'matrix-js-sdk/lib/crypto-api';
import { describe, expect, it, vi } from 'vitest';
import { DeviceVerificationFlow } from '../../src/app/components/DeviceVerification';

vi.mock('../../src/app/styles/ContainerColor.css', () => ({ ContainerColor: () => 'c' }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

const fakeRequest = (phase: VerificationPhase, extra: Record<string, unknown>) =>
  Object.assign(new EventEmitter(), {
    phase,
    initiatedByMe: true,
    cancel: vi.fn(),
    ...extra,
  });

const mount = async (request: ReturnType<typeof fakeRequest>) => {
  const onExit = vi.fn();
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<DeviceVerificationFlow request={request as never} onExit={onExit} />);
  });
  return { onExit, text: () => textOf(r.root), close: () => r.root.findAllByType('button')[0] };
};

describe('DeviceVerificationFlow failures', () => {
  it('reports a verification that could not be started instead of waiting forever', async () => {
    const request = fakeRequest(VerificationPhase.Ready, {
      startVerification: vi.fn(async () => {
        throw new Error('startVerification(): other device is unknown');
      }),
    });
    const { text, close, onExit } = await mount(request);

    expect(text()).toContain('other device is unknown');
    await act(async () => close().props.onClick());
    expect(request.cancel).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('reports a verifier that fails before the emoji are shown', async () => {
    const verifier = Object.assign(new EventEmitter(), {
      verify: vi.fn(async () => {
        throw new Error('to-device request failed');
      }),
    });
    const { text } = await mount(fakeRequest(VerificationPhase.Started, { verifier }));

    expect(text()).toContain('to-device request failed');
  });

  it('keeps waiting while the verifier is still working', async () => {
    const verifier = Object.assign(new EventEmitter(), {
      verify: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const { text } = await mount(fakeRequest(VerificationPhase.Started, { verifier }));

    expect(text()).toContain('Starting verification');
  });
});

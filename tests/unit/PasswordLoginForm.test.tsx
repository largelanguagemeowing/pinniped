import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordLoginForm } from '../../src/app/pages/auth/login/PasswordLoginForm';

const state = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('../../src/app/pages/auth/login/loginUtil', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/pages/auth/login/loginUtil')>()),
  login: state.login,
  useLoginComplete: () => undefined,
}));
vi.mock('../../src/app/hooks/useAuthServer', () => ({ useAuthServer: () => 'hs.example' }));
vi.mock('../../src/app/hooks/useClientConfig', () => ({ useClientConfig: () => ({}) }));
vi.mock('../../src/app/hooks/useAutoDiscoveryInfo', () => ({
  useAutoDiscoveryInfo: () => ({ 'm.homeserver': { base_url: 'https://hs.example' } }),
}));
vi.mock('../../src/app/utils/device', () => ({ getDeviceDisplayName: () => 'test' }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  Link: () => null,
}));
vi.mock('../../src/app/components/password-input', () => ({ PasswordInput: () => null }));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
  PopOut: () => null,
}));

const submit = async (r: ReturnType<typeof create>) => {
  const form = r.root.findByType('form');
  await act(async () => {
    form.props.onSubmit({
      preventDefault: () => undefined,
      target: { usernameInput: { value: 'bob' }, passwordInput: { value: 'hunter2' } },
    });
  });
};

const mount = async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(<PasswordLoginForm />);
  });
  return r;
};

describe('PasswordLoginForm', () => {
  beforeEach(() => state.login.mockReset());

  it('ignores a second submit while the first sign-in is pending', async () => {
    let finish!: () => void;
    state.login.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const r = await mount();

    await submit(r);
    await submit(r);

    expect(state.login).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});

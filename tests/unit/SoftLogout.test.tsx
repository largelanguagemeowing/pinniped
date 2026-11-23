// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoftLogout } from '../../src/app/pages/client/SoftLogout';

const state = vi.hoisted(() => ({
  login: vi.fn(),
  setFallbackSession: vi.fn(),
  logoutClient: vi.fn(),
}));

vi.mock('../../src/app/pages/auth/login/loginUtil', () => ({ login: state.login }));
vi.mock('../../src/app/state/sessions', () => ({ setFallbackSession: state.setFallbackSession }));
vi.mock('../../src/client/initMatrix', () => ({ logoutClient: state.logoutClient }));
vi.mock('../../src/app/components/splash-screen', () => ({
  SplashScreen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mx = {
  baseUrl: 'https://hs.example',
  getSafeUserId: () => '@me:example.org',
  getDeviceId: () => 'DEVICE',
} as never;

const formWithPassword = (password: string) => {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.name = 'password';
  input.value = password;
  form.append(input);
  return form;
};

describe('SoftLogout', () => {
  const reload = vi.fn();
  beforeEach(() => {
    Object.values(state).forEach((m) => m.mockReset());
    reload.mockReset();
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true });
  });

  const submit = async (r: ReturnType<typeof create>, password: string) => {
    await act(async () => {
      r.root.findByType('form').props.onSubmit({
        preventDefault: () => undefined,
        currentTarget: formWithPassword(password),
      });
    });
  };
  const mount = () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(<SoftLogout mx={mx} reason="Access token has expired" />);
    });
    return r;
  };

  it('signs in again on the same device and stores the new token', async () => {
    state.login.mockResolvedValue({
      baseUrl: 'https://hs.example',
      response: { access_token: 'new', device_id: 'DEVICE', user_id: '@me:example.org' },
    });

    await submit(mount(), 'hunter2');

    expect(state.login).toHaveBeenCalledWith('https://hs.example', {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: '@me:example.org' },
      password: 'hunter2',
      device_id: 'DEVICE',
    });
    expect(state.setFallbackSession).toHaveBeenCalledWith(
      'new',
      'DEVICE',
      '@me:example.org',
      'https://hs.example'
    );
    expect(reload).toHaveBeenCalled();
    expect(state.logoutClient).not.toHaveBeenCalled();
  });

  it('keeps the old session when the sign in fails', async () => {
    state.login.mockRejectedValue(new Error('Forbidden'));

    await submit(mount(), 'wrong');

    expect(state.setFallbackSession).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not submit an empty password', async () => {
    await submit(mount(), '');

    expect(state.login).not.toHaveBeenCalled();
  });
});

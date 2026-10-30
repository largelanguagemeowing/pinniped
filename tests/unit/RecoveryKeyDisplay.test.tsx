import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryKeyDisplay } from '../../src/app/components/DeviceVerificationSetup';

const copyToClipboard = vi.hoisted(() => vi.fn());
const saveAs = vi.hoisted(() => vi.fn());

vi.mock('../../src/app/utils/dom', () => ({ copyToClipboard }));
vi.mock('file-saver', () => ({ default: { saveAs } }));
vi.mock('../../src/app/styles/ContainerColor.css', () => ({ ContainerColor: () => 'container' }));
vi.mock('../../src/app/components/ActionUIA', () => ({
  ActionUIA: () => null,
  ActionUIAFlowsLoader: () => null,
}));
vi.mock('../../src/app/components/password-input', () => ({ PasswordInput: () => null }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));

const KEY = 'EsTc 1abc 2def 3ghi';

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('RecoveryKeyDisplay', () => {
  let r: ReactTestRenderer;
  const onDone = vi.fn();
  const mount = () => {
    act(() => {
      r = create(<RecoveryKeyDisplay recoveryKey={KEY} onDone={onDone} />);
    });
  };
  const button = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n).includes(label))[0];
  const checkbox = () => r.root.findAll((n) => n.props.role === 'checkbox')[0];

  afterEach(() => {
    act(() => r.unmount());
    vi.clearAllMocks();
  });

  it('masks the key until shown', () => {
    mount();
    expect(JSON.stringify(r.toJSON())).not.toContain(KEY);
    act(() => button('Show').props.onClick());
    expect(JSON.stringify(r.toJSON())).toContain(KEY);
  });

  it('keeps Done disabled until the person confirms they saved the key', () => {
    mount();
    expect(button('Done').props.disabled).toBe(true);

    act(() => checkbox().props.onClick());
    expect(checkbox().props['aria-checked']).toBe(true);
    expect(button('Done').props.disabled).toBe(false);

    act(() => button('Done').props.onClick());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('unticking the confirmation disables Done again', () => {
    mount();
    act(() => checkbox().props.onClick());
    act(() => checkbox().props.onClick());
    expect(button('Done').props.disabled).toBe(true);
  });

  it('copies the real key even while it is masked, and says so', () => {
    mount();
    act(() => button('Copy key').props.onClick());
    expect(copyToClipboard).toHaveBeenCalledWith(KEY);
    expect(textOf(button('Copied'))).toContain('Copied');
  });

  it('downloads the key as a text file', () => {
    mount();
    act(() => button('Download as file').props.onClick());
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'recovery-key.txt');
  });
});

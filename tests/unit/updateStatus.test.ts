import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createUpdateStatus } = require('../../electron/update-status.cjs') as {
  createUpdateStatus: (onChange: (status: Status) => void) => {
    get: () => Status;
    busy: () => boolean;
    handle: (event: string, payload?: unknown) => void;
  };
};

type Status = { state: string; version?: string; percent?: number; message?: string };

const fresh = () => {
  const onChange = vi.fn();
  return { onChange, status: createUpdateStatus(onChange) };
};

describe('update status', () => {
  it('starts idle and not busy', () => {
    const { status } = fresh();
    expect(status.get()).toEqual({ state: 'idle' });
    expect(status.busy()).toBe(false);
  });

  it('follows a check that finds an update through to ready', () => {
    const { status } = fresh();

    status.handle('checking-for-update');
    expect(status.busy()).toBe(true);

    status.handle('update-available', { version: '4.14.0' });
    status.handle('download-progress', { percent: 41.6 });
    expect(status.get()).toEqual({ state: 'downloading', version: '4.14.0', percent: 42 });
    expect(status.busy()).toBe(true);

    status.handle('update-downloaded', { version: '4.14.0' });
    expect(status.get()).toEqual({ state: 'ready', version: '4.14.0' });
    expect(status.busy()).toBe(false);
  });

  it('reports a check that finds nothing as current', () => {
    const { status } = fresh();
    status.handle('checking-for-update');
    status.handle('update-not-available');
    expect(status.get()).toEqual({ state: 'current' });
  });

  it('ignores progress when nothing is downloading', () => {
    const { status, onChange } = fresh();
    status.handle('download-progress', { percent: 50 });
    expect(status.get()).toEqual({ state: 'idle' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a downloaded update ready through later checks', () => {
    const { status } = fresh();
    status.handle('update-downloaded', { version: '4.14.0' });

    status.handle('checking-for-update');
    status.handle('update-available', { version: '4.14.0' });
    status.handle('update-not-available');
    status.handle('error', new Error('offline'));

    expect(status.get()).toEqual({ state: 'ready', version: '4.14.0' });
  });

  it('can check again after an error or a result', () => {
    const { status } = fresh();
    status.handle('error', new Error('offline'));
    expect(status.busy()).toBe(false);

    status.handle('checking-for-update');
    expect(status.get()).toEqual({ state: 'checking' });
  });

  it('keeps only the first line of an error, and bounds it', () => {
    const { status } = fresh();
    status.handle('error', new Error(`HTTP 404\n${'x'.repeat(5000)}`));
    expect(status.get()).toEqual({ state: 'error', message: 'HTTP 404' });

    status.handle('error', new Error('y'.repeat(5000)));
    expect((status.get().message ?? '').length).toBeLessThanOrEqual(200);
  });

  it('copes with an error that is not an Error', () => {
    const { status } = fresh();
    status.handle('error', 'boom');
    expect(status.get()).toEqual({ state: 'error', message: 'boom' });
  });

  it('reports every change, and ignores unknown events', () => {
    const { status, onChange } = fresh();
    status.handle('checking-for-update');
    status.handle('something-else');
    status.handle('update-not-available');
    expect(onChange.mock.calls.map(([s]) => s.state)).toEqual(['checking', 'current']);
  });
});

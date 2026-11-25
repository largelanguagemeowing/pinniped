// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallStatsDebug } from '../../src/app/features/call-status/stats/CallStatsDebug';
import type { CallStatsConnection } from '../../src/app/plugins/call/engine/livekit/callStats';

vi.hoisted(() => {
  Object.assign(globalThis, { __APP_VERSION__: '0', __APP_COMMIT__: 'test' });
});
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const behavior = <T,>(value: T) => ({ value, subscribe: () => ({ unsubscribe: () => {} }) });

const connection = (url: string): CallStatsConnection => ({
  host: new URL(url).hostname,
  url,
  rtt: 10,
  transport: { bytesSent: 0, bytesReceived: 0 },
  outbound: [],
  inbound: [],
});

const render = async (urls: string[]) => {
  const call = {
    roomId: '!r:example.org',
    room: { getMember: () => undefined, name: 'Room', hasEncryptionStateEvent: () => false },
    stats$: behavior([{ time: 1, connections: urls.map(connection) }]),
    mediaDevices: { audioOutput: { available$: behavior(new Map()) } },
    encryptionLog$: behavior([]),
  };
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(<CallStatsDebug call={call as never} requestClose={() => {}} />);
  });
  return container;
};

describe('CallStatsDebug sidebar', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps one section per connection when two share a hostname', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(['https://sfu.example.org/livekit/a', 'https://sfu.example.org/livekit/b']);
    expect(document.body.textContent?.match(/RTC Debug/g)).toHaveLength(2);
    expect(error.mock.calls.flat().join('\n')).not.toContain('same key');
  });
});

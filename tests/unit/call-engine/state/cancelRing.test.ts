import { describe, expect, it, vi } from 'vitest';
import { cancelRing } from '../../../../src/app/plugins/call/cancelRing';

describe('cancelRing', () => {
  it('redacts the notification that started the ring', async () => {
    const mx = { redactEvent: vi.fn().mockResolvedValue({}) };
    await cancelRing(mx, '!room:example.org', { event_id: '$ring' });
    expect(mx.redactEvent).toHaveBeenCalledWith('!room:example.org', '$ring');
  });

  it('does nothing before a notification was sent', async () => {
    const mx = { redactEvent: vi.fn() };
    await cancelRing(mx, '!room:example.org', null);
    expect(mx.redactEvent).not.toHaveBeenCalled();
  });

  it('survives a failed redaction', async () => {
    const mx = { redactEvent: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(
      cancelRing(mx, '!room:example.org', { event_id: '$ring' })
    ).resolves.toBeUndefined();
  });
});

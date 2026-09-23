import { backoffMs, NotificationDeliveryWorker } from './notification-delivery.worker';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'd1',
  notification_id: 'n1',
  organization_id: 'org',
  channel: 'fcm_push',
  attempts: 0,
  created_at: new Date(),
  user_id: 'u1',
  type: 'invoice',
  data: { code: 'HD1' },
  target: null,
  device_id: 'dev-1',
  fcm_token: 'tok',
  platform: 'ios',
  locale: 'vi',
  revoked_at: null,
  ...overrides,
});

function setup(claimed: any[], deliver: jest.Mock) {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let served = false;
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('WITH due AS')) {
        if (served) return [];
        served = true;
        return claimed;
      }
      if (sql.includes('COUNT(*)::int AS count')) return [{ user_id: 'u1', count: 2 }];
      return [];
    }),
  };
  const registry = { byType: () => ({ priority: 'high' }) };
  const channel = { key: 'fcm_push', perDevice: true, deliver };
  const worker = new NotificationDeliveryWorker(dataSource as any, registry as any, [channel as any]);
  const updates = () => queries.filter((q) => q.sql.trim().startsWith('UPDATE'));
  return { worker, updates };
}

describe('NotificationDeliveryWorker', () => {
  it('marks a successful send as sent, passing the unread badge', async () => {
    const deliver = jest.fn().mockResolvedValue({ outcome: 'sent', providerMessageId: 'm1' });
    const t = setup([row()], deliver);
    await t.worker.pollOnce();

    expect(deliver.mock.calls[0][0]).toMatchObject({ unreadCount: 2, priority: 'high', device: { fcmToken: 'tok' } });
    expect(t.updates()[0].sql).toContain(`"status" = 'sent'`);
  });

  it('schedules a retry with backoff', async () => {
    const t = setup([row({ attempts: 1 })], jest.fn().mockResolvedValue({ outcome: 'retry', error: 'x' }));
    await t.worker.pollOnce();
    const update = t.updates()[0];
    expect(update.sql).toContain(`"status" = 'retrying'`);
    expect(update.params).toEqual(['d1', 2, 'x', String(backoffMs(2))]);
  });

  it('gives up after the max attempts', async () => {
    const t = setup([row({ attempts: 5 })], jest.fn().mockResolvedValue({ outcome: 'retry', error: 'x' }));
    await t.worker.pollOnce();
    expect(t.updates()[0].sql).toContain(`"status" = 'failed'`);
  });

  it('drops and revokes the device on a dead token', async () => {
    const t = setup(
      [row()],
      jest.fn().mockResolvedValue({ outcome: 'drop', error: 'dead', revokeDevice: true }),
    );
    await t.worker.pollOnce();
    const [delivery, device] = t.updates();
    expect(delivery.params).toEqual(['d1', 'dropped', 'dead']);
    expect(device.sql).toContain('"user_devices"');
  });

  it('expires stale rows without calling the channel', async () => {
    const deliver = jest.fn();
    const t = setup([row({ created_at: new Date(Date.now() - 2 * 3600 * 1000) })], deliver);
    await t.worker.pollOnce();
    expect(deliver).not.toHaveBeenCalled();
    expect(t.updates()[0].params).toEqual(['d1', 'expired', 'expired']);
  });

  it('drops rows whose device was revoked meanwhile', async () => {
    const deliver = jest.fn();
    const t = setup([row({ revoked_at: new Date() })], deliver);
    await t.worker.pollOnce();
    expect(deliver).not.toHaveBeenCalled();
    expect(t.updates()[0].params).toEqual(['d1', 'dropped', 'device-revoked']);
  });

  it('backoff is 10s × 2^n capped at one hour', () => {
    expect(backoffMs(1)).toBe(20_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

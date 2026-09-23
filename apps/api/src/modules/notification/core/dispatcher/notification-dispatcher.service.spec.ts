import { NotificationDispatcher } from './notification-dispatcher.service';
import type { NotificationContext, NotificationDefinition } from '../notification.types';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';

const definition = (overrides: Partial<NotificationDefinition> = {}): NotificationDefinition =>
  ({
    type: 'invoice',
    trigger: { kind: 'event', topic: 'erp.sale.posted' },
    permissions: ['pos.invoice.read'],
    excludeActor: true,
    targetApps: ['erp_manager'],
    channels: ['fcm_push', 'websocket'],
    priority: 'high',
    defaultEnabled: true,
    build: jest.fn(async () => ({ data: { code: 'HD1' }, target: { type: 'invoice', id: 'inv' } })),
    ...overrides,
  }) as NotificationDefinition;

const ctx: NotificationContext = {
  eventId: EVENT,
  organizationId: ORG,
  branchId: BRANCH,
  actorId: ACTOR,
  occurredAt: new Date(),
  payload: {},
};

function setup({
  recipients = ['u1', 'u2'],
  kept = recipients,
  inserted = kept,
}: { recipients?: string[]; kept?: string[]; inserted?: string[] } = {}) {
  const manager = {
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('INSERT INTO "notifications"')) {
        return inserted.map((user, i) => ({ id: `n${i}`, user_id: user }));
      }
      if (sql.includes('INSERT INTO "notification_deliveries"')) return [{ id: 'd1' }];
      return [];
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const resolver = { resolve: jest.fn().mockResolvedValue(recipients) };
  const preferences = { filter: jest.fn().mockResolvedValue(kept) };
  const worker = { kick: jest.fn() };
  const websocket = { notifyCreated: jest.fn() };
  const channel = { key: 'fcm_push', perDevice: true, deliver: jest.fn() };
  const dispatcher = new NotificationDispatcher(
    dataSource as any,
    resolver as any,
    preferences as any,
    worker as any,
    websocket as any,
    [channel as any],
  );
  return { dispatcher, manager, resolver, preferences, worker, websocket };
}

describe('NotificationDispatcher', () => {
  it('runs the pipeline: resolve (minus actor) → preferences → build → inbox + deliveries → kick', async () => {
    const t = setup();
    const def = definition();

    const outcome = await t.dispatcher.dispatch(def, ctx);

    expect(t.resolver.resolve).toHaveBeenCalledWith({
      organizationId: ORG,
      branchId: BRANCH,
      permissions: ['pos.invoice.read'],
      excludeUserId: ACTOR,
    });
    expect(t.preferences.filter).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice', branchId: BRANCH, userIds: ['u1', 'u2'] }),
    );
    expect(def.build).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'created', notifications: 2, deliveries: 1 });
    expect(t.worker.kick).toHaveBeenCalled();
    expect(t.websocket.notifyCreated).toHaveBeenCalled();
    // Idempotency lives in SQL, not in memory.
    const insert = t.manager.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO "notifications"'))!;
    expect(insert[0]).toContain('ON CONFLICT ("source_event_id", "type", "user_id") DO NOTHING');
  });

  it('explicit recipients skip the resolver but still go through preferences, with the scope', async () => {
    const t = setup({ recipients: [], kept: ['u9'] });
    await t.dispatcher.dispatch(definition(), { ...ctx, recipientUserIds: ['u9'], scope: 'chainOnly' });

    expect(t.resolver.resolve).not.toHaveBeenCalled();
    expect(t.preferences.filter).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u9'], scope: 'chainOnly' }));
  });

  it('keeps the actor when excludeActor is false', async () => {
    const t = setup();
    await t.dispatcher.dispatch(definition({ excludeActor: false }), ctx);
    expect(t.resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ excludeUserId: undefined }));
  });

  it('shouldSend=false stops before touching recipients', async () => {
    const t = setup();
    const outcome = await t.dispatcher.dispatch(definition({ shouldSend: () => false }), ctx);
    expect(outcome).toEqual({ status: 'skipped', reason: 'should-send' });
    expect(t.resolver.resolve).not.toHaveBeenCalled();
  });

  it('no recipient after preferences → nothing built, nothing written', async () => {
    const t = setup({ recipients: ['u1'], kept: [] });
    const def = definition();
    const outcome = await t.dispatcher.dispatch(def, ctx);
    expect(outcome).toEqual({ status: 'skipped', reason: 'no-recipient' });
    expect(def.build).not.toHaveBeenCalled();
    expect(t.manager.query).not.toHaveBeenCalled();
  });

  it('a replayed event (every row conflicts) creates nothing and kicks nothing', async () => {
    const t = setup({ inserted: [] });
    const outcome = await t.dispatcher.dispatch(definition(), ctx);
    expect(outcome).toEqual({ status: 'created', notifications: 0, deliveries: 0 });
    expect(t.worker.kick).not.toHaveBeenCalled();
    expect(t.websocket.notifyCreated).not.toHaveBeenCalled();
  });

  it('skips channels the definition did not opt into', async () => {
    const t = setup();
    await t.dispatcher.dispatch(definition({ channels: [] }), ctx);
    expect(t.manager.query.mock.calls.some(([sql]) => sql.includes('notification_deliveries'))).toBe(false);
    expect(t.websocket.notifyCreated).not.toHaveBeenCalled();
  });

  it('writes a non-uuid actor (e.g. "system") as NULL', async () => {
    const t = setup();
    await t.dispatcher.dispatch(definition(), { ...ctx, actorId: 'system' });
    const insert = t.manager.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO "notifications"'))!;
    expect(insert[1]?.[6]).toBeNull();
  });
});

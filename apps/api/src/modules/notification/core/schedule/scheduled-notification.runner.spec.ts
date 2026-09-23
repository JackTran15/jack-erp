import { ScheduledNotificationRunner } from './scheduled-notification.runner';

/** 09:00 business time (UTC+7) = 02:00 UTC. */
const at0900 = new Date('2026-09-22T02:00:30Z');
const at0901 = new Date('2026-09-22T02:01:00Z');
const nextDay0900 = new Date('2026-09-23T02:00:10Z');

describe('ScheduledNotificationRunner', () => {
  const ctx = { eventId: 'e', organizationId: 'o', occurredAt: at0900, payload: {} };
  let collect: jest.Mock;
  let dispatch: jest.Mock;
  let runner: ScheduledNotificationRunner;

  beforeEach(() => {
    delete process.env.NOTIFICATION_SCHEDULE_DISABLED;
    collect = jest.fn().mockResolvedValue([ctx, { ...ctx, eventId: 'e2' }]);
    dispatch = jest.fn().mockResolvedValue(undefined);
    const definition = { type: 'revenue', trigger: { kind: 'schedule', at: '09:00' }, collect };
    runner = new ScheduledNotificationRunner({ scheduled: () => [definition] } as any, { dispatch } as any);
  });

  afterAll(() => delete process.env.NOTIFICATION_SCHEDULE_DISABLED);

  it('fires at its HH:mm in business time and dispatches every firing', async () => {
    await expect(runner.tick(at0900)).resolves.toEqual(['revenue']);
    expect(collect).toHaveBeenCalledWith(at0900);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not fire outside its minute, nor twice the same day', async () => {
    await runner.tick(at0900);
    await expect(runner.tick(at0900)).resolves.toEqual([]);
    await expect(runner.tick(at0901)).resolves.toEqual([]);
    await expect(runner.tick(nextDay0900)).resolves.toEqual(['revenue']);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('one failing firing does not stop the others', async () => {
    dispatch.mockRejectedValueOnce(new Error('boom'));
    await runner.tick(at0900);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('a failing collect is logged, not thrown', async () => {
    collect.mockRejectedValueOnce(new Error('db down'));
    await expect(runner.tick(at0900)).resolves.toEqual(['revenue']);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('NOTIFICATION_SCHEDULE_DISABLED=1 disables it', async () => {
    process.env.NOTIFICATION_SCHEDULE_DISABLED = '1';
    await expect(runner.tick(at0900)).resolves.toEqual([]);
    expect(collect).not.toHaveBeenCalled();
  });
});

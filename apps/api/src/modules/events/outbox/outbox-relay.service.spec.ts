import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OutboxRelayService } from './outbox-relay.service';
import { EventPublisher } from '../event-publisher.service';

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;
  let publisher: { publish: jest.Mock };
  let queries: Array<{ sql: string; params: any[] }>;
  let pendingRows: any[];

  const buildManager = () => ({
    query: jest.fn(async (sql: string, params: any[]) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT * FROM "outbox_messages"')) {
        return pendingRows;
      }
      return [];
    }),
  });

  beforeEach(async () => {
    queries = [];
    pendingRows = [];
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn((cb: any) => cb(buildManager())),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: dataSource },
        { provide: EventPublisher, useValue: publisher },
      ],
    }).compile();

    service = module.get(OutboxRelayService);
  });

  it('publishes pending rows then marks them published', async () => {
    pendingRows = [
      {
        id: 'o-1',
        topic: 'erp.cash.voucher.needed.expense',
        payload: { eventId: 'evt-1', organizationId: 'org-1' },
        partition_key: 'key-1',
        attempts: 0,
      },
    ];

    const count = await service.pollOnce();

    expect(count).toBe(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'erp.cash.voucher.needed.expense',
      expect.objectContaining({ eventId: 'evt-1' }),
      'key-1',
    );
    const update = queries.find((q) => q.sql.includes('SET "published_at" = now()'));
    expect(update).toBeDefined();
    expect(update!.params[0]).toBe('o-1');
  });

  it('backs off (does not mark published) when publish fails', async () => {
    pendingRows = [
      {
        id: 'o-2',
        topic: 't',
        payload: { eventId: 'evt-2' },
        partition_key: null,
        attempts: 1,
      },
    ];
    publisher.publish.mockRejectedValue(new Error('kafka down'));

    const count = await service.pollOnce();

    expect(count).toBe(0);
    expect(
      queries.some((q) => q.sql.includes('SET "published_at" = now()')),
    ).toBe(false);
    const backoff = queries.find((q) => q.sql.includes('"next_attempt_at" = now() +'));
    expect(backoff).toBeDefined();
    // attempts incremented from 1 → 2
    expect(backoff!.params[1]).toBe(2);
    expect(backoff!.params[2]).toBe('kafka down');
  });

  it('does nothing when there are no pending rows', async () => {
    pendingRows = [];
    const count = await service.pollOnce();
    expect(count).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('republishes the same eventId on a second poll (at-least-once is idempotent downstream)', async () => {
    // Crash-before-mark: the row is still pending on the next poll and gets
    // re-published with the same deterministic eventId.
    pendingRows = [
      {
        id: 'o-3',
        topic: 't',
        payload: { eventId: 'evt-deterministic' },
        partition_key: null,
        attempts: 0,
      },
    ];
    await service.pollOnce();
    await service.pollOnce();

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.publish.mock.calls[0][1].eventId).toBe('evt-deterministic');
    expect(publisher.publish.mock.calls[1][1].eventId).toBe('evt-deterministic');
  });
});

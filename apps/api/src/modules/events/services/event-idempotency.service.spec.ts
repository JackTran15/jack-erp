import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import { EventIdempotencyService } from './event-idempotency.service';
import { ProcessedEventEntity } from '../entities/processed-event.entity';

const buildEvent = (eventId = 'evt-1'): DomainEvent<unknown> => ({
  eventId,
  eventType: DomainEventType.INVOICE_CANCELLED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {},
});

describe('EventIdempotencyService', () => {
  let service: EventIdempotencyService;
  let executeMock: jest.Mock;
  let deleteMock: jest.Mock;

  beforeEach(async () => {
    executeMock = jest.fn();
    deleteMock = jest.fn().mockResolvedValue({ affected: 1 });

    const qb = {
      insert: () => qb,
      into: () => qb,
      values: () => qb,
      orIgnore: () => qb,
      execute: executeMock,
    };

    const repo = {
      createQueryBuilder: () => qb,
      delete: deleteMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIdempotencyService,
        { provide: getRepositoryToken(ProcessedEventEntity), useValue: repo },
      ],
    }).compile();

    service = module.get(EventIdempotencyService);
  });

  describe('tryClaim', () => {
    it('returns true on first claim', async () => {
      executeMock.mockResolvedValue({ identifiers: [{ consumerName: 'c', eventId: 'evt-1' }] });
      const claimed = await service.tryClaim('consumer-a', buildEvent(), 'topic.x');
      expect(claimed).toBe(true);
    });

    it('returns false when row already exists (orIgnore swallowed insert)', async () => {
      executeMock.mockResolvedValue({ identifiers: [] });
      const claimed = await service.tryClaim('consumer-a', buildEvent(), 'topic.x');
      expect(claimed).toBe(false);
    });

    it('returns false when identifiers is undefined', async () => {
      executeMock.mockResolvedValue({});
      const claimed = await service.tryClaim('consumer-a', buildEvent(), 'topic.x');
      expect(claimed).toBe(false);
    });
  });

  describe('release', () => {
    it('deletes the row for the given consumer+event', async () => {
      await service.release('consumer-a', 'evt-1');
      expect(deleteMock).toHaveBeenCalledWith({ consumerName: 'consumer-a', eventId: 'evt-1' });
    });
  });
});

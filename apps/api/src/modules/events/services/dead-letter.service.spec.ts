import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeadLetterStatus } from '@erp/shared-interfaces';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterEventEntity } from '../entities/dead-letter-event.entity';
import { EventPublisher } from '../event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const dleStub = (overrides: Partial<DeadLetterEventEntity> = {}): DeadLetterEventEntity =>
  ({
    id: 'dle-1',
    organizationId: 'org-1',
    topic: 'erp.stock.deduction',
    partition: 0,
    offset: '12',
    key: 'product-1',
    payload: {
      eventId: 'evt-1',
      eventType: 'STOCK_DEDUCTION_REQUESTED',
      timestamp: '2026-05-11T00:00:00Z',
      organizationId: 'org-1',
      correlationId: 'inv-1',
      payload: { invoiceId: 'inv-1' },
    },
    error: 'boom',
    retryCount: 3,
    status: DeadLetterStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DeadLetterEventEntity;

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let publisher: { publish: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id ?? 'dle-new' })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        { provide: getRepositoryToken(DeadLetterEventEntity), useValue: repo },
        { provide: EventPublisher, useValue: publisher },
      ],
    }).compile();

    service = module.get(DeadLetterService);
  });

  describe('record', () => {
    it('inserts a PENDING row', async () => {
      const saved = await service.record({
        topic: 'erp.stock.deduction',
        partition: 1,
        offset: '7',
        key: 'product-x',
        payload: { foo: 'bar' },
        error: 'fail',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'erp.stock.deduction',
          status: DeadLetterStatus.PENDING,
          retryCount: 3,
          payload: { foo: 'bar' },
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(saved.id).toBeDefined();
    });
  });

  describe('list', () => {
    it('filters by status and topic, paginates', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[dleStub()], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.list(
        { status: DeadLetterStatus.PENDING, topic: 'erp.stock.deduction', page: 1, pageSize: 10 },
        actor,
      );

      expect(qb.where).toHaveBeenCalledWith('dle.organizationId = :orgId', { orgId: 'org-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('dle.status = :status', { status: DeadLetterStatus.PENDING });
      expect(qb.andWhere).toHaveBeenCalledWith('dle.topic = :topic', { topic: 'erp.stock.deduction' });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('returns the row if found', async () => {
      const row = dleStub();
      repo.findOne.mockResolvedValue(row);
      await expect(service.getById('dle-1', actor)).resolves.toBe(row);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing', actor)).rejects.toThrow(NotFoundException);
    });
  });

  describe('replay', () => {
    it('republishes event and marks RESOLVED', async () => {
      const row = dleStub();
      repo.findOne.mockResolvedValue(row);

      const result = await service.replay('dle-1', actor);

      expect(publisher.publish).toHaveBeenCalledWith('erp.stock.deduction', row.payload, 'product-1');
      expect(result.status).toBe(DeadLetterStatus.RESOLVED);
      expect(result.resolvedBy).toBe('user-1');
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('rejects replay of RESOLVED row', async () => {
      repo.findOne.mockResolvedValue(dleStub({ status: DeadLetterStatus.RESOLVED }));
      await expect(service.replay('dle-1', actor)).rejects.toThrow(BadRequestException);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('rejects replay of IGNORED row', async () => {
      repo.findOne.mockResolvedValue(dleStub({ status: DeadLetterStatus.IGNORED }));
      await expect(service.replay('dle-1', actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('ignore', () => {
    it('marks IGNORED with notes', async () => {
      repo.findOne.mockResolvedValue(dleStub());
      const result = await service.ignore('dle-1', 'known data issue', actor);
      expect(result.status).toBe(DeadLetterStatus.IGNORED);
      expect(result.notes).toBe('known data issue');
      expect(result.resolvedBy).toBe('user-1');
    });

    it('rejects ignoring a RESOLVED row', async () => {
      repo.findOne.mockResolvedValue(dleStub({ status: DeadLetterStatus.RESOLVED }));
      await expect(service.ignore('dle-1', undefined, actor)).rejects.toThrow(BadRequestException);
    });
  });
});

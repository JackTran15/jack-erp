import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../metrics/metrics.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { CustomerEntity } from './customer.entity';
import { MembershipCardEntity, MembershipTier } from './membership-card.entity';
import { CustomerService } from './customer.service';
import { EventPublisher } from '../events/event-publisher.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const customerStub = (overrides: Partial<CustomerEntity> = {}): CustomerEntity =>
  ({
    id: 'cust-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-0001',
    status: CustomerStatus.ACTIVE,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as CustomerEntity;

describe('CustomerService', () => {
  let service: CustomerService;
  let customerRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let eventPublisher: { publish: jest.Mock };
  let dataSource: {
    createQueryRunner: jest.Mock;
    transaction: jest.Mock;
  };
  let membershipCardRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { save: jest.Mock };
  };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: { save: jest.fn((entity) => entity) },
    };

    customerRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ id: 'cust-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      merge: jest.fn((target, source) => Object.assign(target, source)),
      createQueryBuilder: jest.fn(),
    };
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      transaction: jest.fn(),
    };

    membershipCardRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => ({ id: 'card-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: MetricsService, useValue: { incCacheHit() {}, incCacheMiss() {}, observeCheckout() {}, incImportRows() {}, incImportJob() {}, observeKafkaPublish() {}, incKafkaPublishError() {}, observeHttp() {} } },
        CustomerService,
        { provide: getRepositoryToken(CustomerEntity), useValue: customerRepo },
        { provide: getRepositoryToken(MembershipCardEntity), useValue: membershipCardRepo },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(CustomerService);
  });

  // =========================================================================
  // create – auto silver membership card
  // =========================================================================
  describe('create (membership card)', () => {
    it('auto-issues a provisional silver card when membershipCard is omitted', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      let savedCard: Partial<MembershipCardEntity> | undefined;
      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          create: jest.fn((Entity, dto) => {
            if (Entity === CustomerEntity) return { id: 'cust-new', ...dto };
            return dto;
          }),
          save: jest.fn(async (entity) => {
            if ('customerId' in entity) savedCard = entity;
            return entity;
          }),
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await service.create({ code: 'KH000001', name: 'Jane Doe', phone: '0901234567' }, actor);

      expect(savedCard).toEqual(
        expect.objectContaining({
          customerId: 'cust-new',
          tier: MembershipTier.SILVER,
          points: 0,
          isActive: true,
        }),
      );
      expect(savedCard?.cardNumber).toMatch(/^MC/);
    });

    it('respects an explicit tier when membershipCard is provided', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      let savedCard: Partial<MembershipCardEntity> | undefined;
      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          create: jest.fn((Entity, dto) => {
            if (Entity === CustomerEntity) return { id: 'cust-new', ...dto };
            return dto;
          }),
          save: jest.fn(async (entity) => {
            if ('customerId' in entity) savedCard = entity;
            return entity;
          }),
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await service.create(
        {
          code: 'KH000002',
          name: 'VIP Guest',
          phone: '0901234568',
          membershipCard: { cardNumber: 'MCVIP001', tier: MembershipTier.GOLD },
        },
        actor,
      );

      expect(savedCard).toEqual(
        expect.objectContaining({
          cardNumber: 'MCVIP001',
          tier: MembershipTier.GOLD,
        }),
      );
    });
  });

  // =========================================================================
  // create – duplicate detection (beforeCreate hook)
  // =========================================================================
  describe('create (duplicate detection)', () => {
    it('throws ConflictException when email already exists', async () => {
      customerRepo.findOne.mockResolvedValue(customerStub());

      await expect(
        (service as any).beforeCreate(
          { name: 'Jane Doe', email: 'john@example.com' },
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('passes when no duplicate exists', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).beforeCreate(
        { name: 'Jane Doe', email: 'unique@example.com' },
        actor,
      );

      expect(result.email).toBe('unique@example.com');
    });
  });

  // =========================================================================
  // merge
  // =========================================================================
  describe('merge', () => {
    it('sets source to MERGED and publishes an event', async () => {
      const source = customerStub({ id: 'cust-src' });
      const target = customerStub({ id: 'cust-tgt', email: 'target@example.com' });

      customerRepo.findOne
        .mockResolvedValueOnce(source) // getById for source
        .mockResolvedValueOnce(target); // getById for target

      const result = await service.merge('cust-src', 'cust-tgt', actor);

      expect(result.status).toBe(CustomerStatus.MERGED);
      expect(result.mergedIntoId).toBe('cust-tgt');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        'erp.customer.merged',
        expect.objectContaining({
          eventType: 'CUSTOMER_MERGED',
          payload: expect.objectContaining({
            sourceCustomerId: 'cust-src',
            targetCustomerId: 'cust-tgt',
          }),
        }),
      );
    });

    it('rejects merging into a non-existent target', async () => {
      const source = customerStub({ id: 'cust-src' });
      customerRepo.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null);

      await expect(
        service.merge('cust-src', 'cust-missing', actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects merging an already-merged source', async () => {
      const source = customerStub({ id: 'cust-src', status: CustomerStatus.MERGED });
      const target = customerStub({ id: 'cust-tgt' });

      customerRepo.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);

      await expect(
        service.merge('cust-src', 'cust-tgt', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects merging into an already-merged target', async () => {
      const source = customerStub({ id: 'cust-src' });
      const target = customerStub({
        id: 'cust-tgt',
        status: CustomerStatus.MERGED,
      });

      customerRepo.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);

      await expect(
        service.merge('cust-src', 'cust-tgt', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects merging a customer into itself', async () => {
      await expect(
        service.merge('cust-1', 'cust-1', actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // update – rejects MERGED customer (beforeUpdate hook)
  // =========================================================================
  describe('update (merged customer guard)', () => {
    it('throws BadRequestException when updating a MERGED customer', async () => {
      customerRepo.findOne.mockResolvedValue(
        customerStub({ status: CustomerStatus.MERGED }),
      );

      await expect(
        (service as any).beforeUpdate(
          'cust-1',
          { name: 'Updated' },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows update on a non-merged customer', async () => {
      customerRepo.findOne
        .mockResolvedValueOnce(customerStub({ status: CustomerStatus.ACTIVE }))
        .mockResolvedValue(null); // duplicate check

      const result = await (service as any).beforeUpdate(
        'cust-1',
        { name: 'Updated' },
        actor,
      );

      expect(result.name).toBe('Updated');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { DiscountCodeEntity, DiscountType } from './discount-code.entity';
import { DiscountCodeService } from './discount-code.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const discountCodeStub = (
  overrides: Partial<DiscountCodeEntity> = {},
): DiscountCodeEntity =>
  ({
    id: 'dc-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'SAVE10',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    minOrderValue: 0,
    maxUses: 100,
    usedCount: 0,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    isActive: true,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DiscountCodeEntity;

describe('DiscountCodeService', () => {
  let service: DiscountCodeService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    increment: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ id: 'dc-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountCodeService,
        { provide: getRepositoryToken(DiscountCodeEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(DiscountCodeService);
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('throws ConflictException when code already exists in org', async () => {
      repo.findOne.mockResolvedValue(discountCodeStub());

      await expect(
        service.create(
          {
            code: 'SAVE10',
            discountType: DiscountType.PERCENTAGE,
            discountValue: 10,
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
          },
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates entity with correct fields (usedCount=0, isActive=true, converted dates)', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create(
        {
          code: 'NEWCODE',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 50,
          validFrom: '2026-03-01',
          validTo: '2026-06-30',
        },
        actor,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NEWCODE',
          usedCount: 0,
          isActive: true,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          validFrom: new Date('2026-03-01'),
          validTo: new Date('2026-06-30'),
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // findOne
  // =========================================================================
  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns entity when found', async () => {
      repo.findOne.mockResolvedValue(discountCodeStub());

      const result = await service.findOne('dc-1', actor);

      expect(result.id).toBe('dc-1');
    });
  });

  // =========================================================================
  // findByCode
  // =========================================================================
  describe('findByCode', () => {
    it('throws NotFoundException when code not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findByCode('NOTEXIST', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns entity when code found', async () => {
      repo.findOne.mockResolvedValue(discountCodeStub());

      const result = await service.findByCode('SAVE10', actor);

      expect(result.code).toBe('SAVE10');
    });
  });

  // =========================================================================
  // validate
  // =========================================================================
  describe('validate', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('throws BadRequestException when isActive=false', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      repo.findOne.mockResolvedValue(discountCodeStub({ isActive: false }));

      await expect(service.validate('SAVE10', 500, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when now < validFrom (not yet valid)', async () => {
      jest.setSystemTime(new Date('2025-12-31'));
      repo.findOne.mockResolvedValue(
        discountCodeStub({
          isActive: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
        }),
      );

      await expect(service.validate('SAVE10', 500, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when now > validTo (expired)', async () => {
      jest.setSystemTime(new Date('2027-01-01'));
      repo.findOne.mockResolvedValue(
        discountCodeStub({
          isActive: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
        }),
      );

      await expect(service.validate('SAVE10', 500, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when usedCount >= maxUses (limit reached)', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      repo.findOne.mockResolvedValue(
        discountCodeStub({
          isActive: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          maxUses: 10,
          usedCount: 10,
        }),
      );

      await expect(service.validate('SAVE10', 500, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when orderValue < minOrderValue', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      repo.findOne.mockResolvedValue(
        discountCodeStub({
          isActive: true,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          maxUses: 100,
          usedCount: 0,
          minOrderValue: 1000,
        }),
      );

      await expect(service.validate('SAVE10', 500, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns entity when all checks pass', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      const stub = discountCodeStub({
        isActive: true,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        maxUses: 100,
        usedCount: 5,
        minOrderValue: 100,
      });
      repo.findOne.mockResolvedValue(stub);

      const result = await service.validate('SAVE10', 500, actor);

      expect(result).toBe(stub);
    });
  });

  // =========================================================================
  // incrementUsedCount
  // =========================================================================
  describe('incrementUsedCount', () => {
    const buildQbMock = (affected: number) => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      return qb;
    };

    it('uses atomic UPDATE via createQueryBuilder and succeeds when affected=1', async () => {
      const qb = buildQbMock(1);
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.incrementUsedCount('dc-1');

      expect(qb.set).toHaveBeenCalledWith({ usedCount: expect.any(Function) });
      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND (max_uses IS NULL OR used_count < max_uses)',
        { id: 'dc-1' },
      );
    });

    it('throws ConflictException when UPDATE affects 0 rows (limit reached)', async () => {
      const qb = buildQbMock(0);
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

      await expect(service.incrementUsedCount('dc-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('uses manager.createQueryBuilder when manager passed', async () => {
      const qb = buildQbMock(1);
      const mockManager = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

      await service.incrementUsedCount('dc-1', mockManager as any);

      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
    });
  });
});

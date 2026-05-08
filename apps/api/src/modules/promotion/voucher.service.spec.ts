import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { VoucherEntity } from './voucher.entity';
import { VoucherService } from './voucher.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const voucherStub = (overrides: Partial<VoucherEntity> = {}): VoucherEntity =>
  ({
    id: 'voucher-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'VOUCHER100',
    faceValue: 100,
    customerId: undefined,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    isUsed: false,
    redeemedInvoiceId: undefined,
    isActive: true,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as VoucherEntity;

describe('VoucherService', () => {
  let service: VoucherService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ id: 'voucher-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        { provide: getRepositoryToken(VoucherEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(VoucherService);
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('throws ConflictException when code already exists', async () => {
      repo.findOne.mockResolvedValue(voucherStub());

      await expect(
        service.create(
          {
            code: 'VOUCHER100',
            faceValue: 100,
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
          },
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates entity with isUsed=false, isActive=true', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create(
        {
          code: 'NEWVOUCHER',
          faceValue: 200,
          validFrom: '2026-03-01',
          validTo: '2026-06-30',
        },
        actor,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NEWVOUCHER',
          faceValue: 200,
          isUsed: false,
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
      repo.findOne.mockResolvedValue(voucherStub({ isActive: false }));

      await expect(service.validate('VOUCHER100', undefined, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when isUsed=true (already used)', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      repo.findOne.mockResolvedValue(voucherStub({ isActive: true, isUsed: true }));

      await expect(service.validate('VOUCHER100', undefined, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when expired', async () => {
      jest.setSystemTime(new Date('2027-01-01'));
      repo.findOne.mockResolvedValue(
        voucherStub({
          isActive: true,
          isUsed: false,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
        }),
      );

      await expect(service.validate('VOUCHER100', undefined, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when not yet valid', async () => {
      jest.setSystemTime(new Date('2025-12-31'));
      repo.findOne.mockResolvedValue(
        voucherStub({
          isActive: true,
          isUsed: false,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
        }),
      );

      await expect(service.validate('VOUCHER100', undefined, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when voucher.customerId is set and customerId doesn't match", async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      repo.findOne.mockResolvedValue(
        voucherStub({
          isActive: true,
          isUsed: false,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          customerId: 'customer-A',
        }),
      );

      await expect(
        service.validate('VOUCHER100', 'customer-B', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns entity when all checks pass AND customerId matches', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      const stub = voucherStub({
        isActive: true,
        isUsed: false,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        customerId: 'customer-A',
      });
      repo.findOne.mockResolvedValue(stub);

      const result = await service.validate('VOUCHER100', 'customer-A', actor);

      expect(result).toBe(stub);
    });

    it('returns entity when voucher.customerId is null (generic voucher)', async () => {
      jest.setSystemTime(new Date('2026-06-01'));
      const stub = voucherStub({
        isActive: true,
        isUsed: false,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        customerId: undefined,
      });
      repo.findOne.mockResolvedValue(stub);

      const result = await service.validate('VOUCHER100', 'any-customer', actor);

      expect(result).toBe(stub);
    });
  });

  // =========================================================================
  // markUsed
  // =========================================================================
  describe('markUsed', () => {
    it('uses atomic UPDATE WHERE isUsed=false to prevent double-use', async () => {
      await service.markUsed('voucher-1', 'invoice-1');

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'voucher-1', isUsed: false, isActive: true },
        { isUsed: true, redeemedInvoiceId: 'invoice-1' },
      );
    });

    it('throws ConflictException when UPDATE affects 0 rows (already used)', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(service.markUsed('voucher-1', 'invoice-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('calls manager.getRepository(...).update when manager provided', async () => {
      const mockManagerRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      };

      await service.markUsed('voucher-1', 'invoice-1', mockManager as any);

      expect(mockManager.getRepository).toHaveBeenCalledWith(VoucherEntity);
      expect(mockManagerRepo.update).toHaveBeenCalledWith(
        { id: 'voucher-1', isUsed: false, isActive: true },
        { isUsed: true, redeemedInvoiceId: 'invoice-1' },
      );
    });
  });
});

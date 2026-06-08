import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { MembershipCardService } from './membership-card.service';
import { MembershipCardEntity, MembershipTier } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

const cardStub = (overrides: Partial<MembershipCardEntity> = {}): MembershipCardEntity =>
  ({
    id: 'card-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    cardNumber: 'MCOR123456',
    tier: MembershipTier.NONE,
    points: 100,
    issuedAt: new Date('2026-01-01'),
    isActive: true,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as MembershipCardEntity;

const pointHistoryStub = (overrides: Partial<PointHistoryEntity> = {}): PointHistoryEntity =>
  ({
    id: 'ph-1',
    cardId: 'card-1',
    type: PointType.EARN,
    delta: 50,
    organizationId: 'org-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    ...overrides,
  }) as PointHistoryEntity;

describe('MembershipCardService', () => {
  let service: MembershipCardService;
  let cardRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
  };
  let historyRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let mockManager: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    insert: jest.Mock;
    increment: jest.Mock;
    decrement: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(async () => {
    mockManager = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      insert: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
      getRepository: jest.fn().mockReturnValue({ update: jest.fn(), increment: jest.fn() }),
    };

    cardRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findAndCount: jest.fn(),
    };

    historyRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipCardService,
        { provide: getRepositoryToken(MembershipCardEntity), useValue: cardRepo },
        { provide: getRepositoryToken(PointHistoryEntity), useValue: historyRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(MembershipCardService);
  });

  // =========================================================================
  // issueCard
  // =========================================================================
  describe('issueCard', () => {
    const issueDto = {
      issuedAt: '2026-01-01',
      tier: MembershipTier.SILVER,
    };

    it('throws ConflictException when active card already exists for customer', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub());

      await expect(service.issueCard('cust-1', issueDto, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates card with points=0, isActive=true, and tier from dto', async () => {
      cardRepo.findOne.mockResolvedValue(null);
      const savedCard = cardStub({ tier: MembershipTier.SILVER });
      cardRepo.create.mockReturnValue(savedCard);
      cardRepo.save.mockResolvedValue(savedCard);

      const result = await service.issueCard('cust-1', issueDto, actor);

      expect(cardRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 0,
          isActive: true,
          tier: MembershipTier.SILVER,
          customerId: 'cust-1',
          organizationId: 'org-1',
        }),
      );
      expect(result).toEqual(savedCard);
    });

    it('defaults tier to NONE when not provided in dto', async () => {
      cardRepo.findOne.mockResolvedValue(null);
      const savedCard = cardStub({ tier: MembershipTier.NONE });
      cardRepo.create.mockReturnValue(savedCard);
      cardRepo.save.mockResolvedValue(savedCard);

      await service.issueCard('cust-1', { issuedAt: '2026-01-01' }, actor);

      expect(cardRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tier: MembershipTier.NONE }),
      );
    });

    it('generates a cardNumber starting with MC', async () => {
      cardRepo.findOne.mockResolvedValue(null);
      cardRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      let capturedData: any;
      cardRepo.create.mockImplementation((data) => {
        capturedData = data;
        return data;
      });

      await service.issueCard('cust-1', issueDto, actor);

      expect(capturedData.cardNumber).toMatch(/^MC/);
    });
  });

  // =========================================================================
  // getCard
  // =========================================================================
  describe('getCard', () => {
    it('returns card when found', async () => {
      const card = cardStub();
      cardRepo.findOne.mockResolvedValue(card);

      const result = await service.getCard('cust-1', actor);

      expect(result).toEqual(card);
    });

    it('throws NotFoundException when card not found', async () => {
      cardRepo.findOne.mockResolvedValue(null);

      await expect(service.getCard('cust-missing', actor)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // updateCard
  // =========================================================================
  describe('updateCard', () => {
    it('updates tier, expiresAt, lomasCardNumber, lomasTier', async () => {
      const card = cardStub();
      cardRepo.findOne.mockResolvedValue(card);
      cardRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const dto = {
        tier: MembershipTier.GOLD,
        expiresAt: '2027-12-31',
        lomasCardNumber: 'LOMAS-001',
        lomasTier: 'gold',
      };

      const result = await service.updateCard('cust-1', dto, actor);

      expect(result.tier).toBe(MembershipTier.GOLD);
      expect(result.expiresAt).toEqual(new Date('2027-12-31'));
      expect(result.lomasCardNumber).toBe('LOMAS-001');
      expect(result.lomasTier).toBe('gold');
    });

    it('does not update fields not provided in dto', async () => {
      const card = cardStub({ tier: MembershipTier.SILVER, lomasCardNumber: 'orig-123' });
      cardRepo.findOne.mockResolvedValue(card);
      cardRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.updateCard('cust-1', {}, actor);

      expect(result.tier).toBe(MembershipTier.SILVER);
      expect(result.lomasCardNumber).toBe('orig-123');
    });

    it('throws NotFoundException when card not found', async () => {
      cardRepo.findOne.mockResolvedValue(null);

      await expect(service.updateCard('cust-missing', {}, actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // adjustPoints
  // =========================================================================
  describe('adjustPoints', () => {
    const baseDto = {
      type: PointType.EARN,
      delta: 50,
      note: 'earned from purchase',
    };

    it('throws NotFoundException when card not found', async () => {
      cardRepo.findOne.mockResolvedValue(null);

      await expect(
        service.adjustPoints('card-missing', baseDto, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when REDEEM type and delta >= 0', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub({ points: 100 }));

      await expect(
        service.adjustPoints('card-1', { type: PointType.REDEEM, delta: 50 }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when REDEEM type and delta === 0', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub({ points: 100 }));

      await expect(
        service.adjustPoints('card-1', { type: PointType.REDEEM, delta: 0 }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when resulting points < 0', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub({ points: 30 }));

      await expect(
        service.adjustPoints('card-1', { type: PointType.REDEEM, delta: -100 }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls manager.increment within transaction for EARN type', async () => {
      const card = cardStub({ points: 100 });
      cardRepo.findOne
        .mockResolvedValueOnce(card) // initial findOne before transaction
        .mockResolvedValueOnce({ ...card, points: 150 }); // findOne after transaction
      mockManager.increment.mockResolvedValue(undefined);
      mockManager.insert.mockResolvedValue(undefined);

      await service.adjustPoints('card-1', { ...baseDto, delta: 50 }, actor);

      expect(mockManager.increment).toHaveBeenCalledWith(
        MembershipCardEntity,
        { id: 'card-1' },
        'points',
        50,
      );
    });

    it('calls manager.insert(PointHistoryEntity) within transaction', async () => {
      const card = cardStub({ points: 100 });
      cardRepo.findOne
        .mockResolvedValueOnce(card)
        .mockResolvedValueOnce({ ...card, points: 150 });
      mockManager.increment.mockResolvedValue(undefined);
      mockManager.insert.mockResolvedValue(undefined);

      await service.adjustPoints('card-1', { ...baseDto, delta: 50 }, actor);

      expect(mockManager.insert).toHaveBeenCalledWith(
        PointHistoryEntity,
        expect.objectContaining({
          cardId: 'card-1',
          type: PointType.EARN,
          delta: 50,
          organizationId: 'org-1',
          createdBy: 'user-1',
        }),
      );
    });

    it('earn type with positive delta succeeds and returns updated card', async () => {
      const card = cardStub({ points: 100 });
      const updatedCard = { ...card, points: 150 };
      cardRepo.findOne
        .mockResolvedValueOnce(card)
        .mockResolvedValueOnce(updatedCard);
      mockManager.increment.mockResolvedValue(undefined);
      mockManager.insert.mockResolvedValue(undefined);

      const result = await service.adjustPoints('card-1', { ...baseDto, delta: 50 }, actor);

      expect(result.points).toBe(150);
    });

    it('adjust type with negative delta that does not go below 0 succeeds', async () => {
      const card = cardStub({ points: 100 });
      const updatedCard = { ...card, points: 70 };
      cardRepo.findOne
        .mockResolvedValueOnce(card)
        .mockResolvedValueOnce(updatedCard);
      mockManager.increment.mockResolvedValue(undefined);
      mockManager.insert.mockResolvedValue(undefined);

      const result = await service.adjustPoints(
        'card-1',
        { type: PointType.ADJUST, delta: -30 },
        actor,
      );

      expect(mockManager.increment).toHaveBeenCalledWith(
        MembershipCardEntity,
        { id: 'card-1' },
        'points',
        -30,
      );
      expect(result.points).toBe(70);
    });

    it('calls cardRepo.findOne after transaction to return updated card', async () => {
      const card = cardStub({ points: 100 });
      const updatedCard = { ...card, points: 150 };
      cardRepo.findOne
        .mockResolvedValueOnce(card)
        .mockResolvedValueOnce(updatedCard);
      mockManager.increment.mockResolvedValue(undefined);
      mockManager.insert.mockResolvedValue(undefined);

      await service.adjustPoints('card-1', { ...baseDto, delta: 50 }, actor);

      // called twice: once before transaction (findOne), once after
      expect(cardRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // getPointHistory
  // =========================================================================
  describe('getPointHistory', () => {
    it('throws NotFoundException when card not found', async () => {
      cardRepo.findOne.mockResolvedValue(null);

      await expect(service.getPointHistory('card-missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns paginated results with data and total', async () => {
      const card = cardStub();
      const histories = [pointHistoryStub(), pointHistoryStub({ id: 'ph-2', delta: 20 })];
      cardRepo.findOne.mockResolvedValue(card);
      historyRepo.findAndCount.mockResolvedValue([histories, 2]);

      const result = await service.getPointHistory('card-1', actor, 1, 20);

      expect(result).toEqual({ data: histories, total: 2, page: 1, limit: 20 });
    });

    it('passes correct skip and take based on page and limit', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub());
      historyRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getPointHistory('card-1', actor, 3, 10);

      expect(historyRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3 - 1) * 10
          take: 10,
        }),
      );
    });

    it('orders point history by createdAt DESC', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub());
      historyRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getPointHistory('card-1', actor);

      expect(historyRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  // =========================================================================
  // redeemPointsForInvoice — synchronous deduction within checkout transaction
  // =========================================================================
  describe('redeemPointsForInvoice', () => {
    const mgr = () => mockManager as unknown as EntityManager;

    it('locks the card, decrements points and records a REDEEM entry', async () => {
      mockManager.findOne.mockResolvedValue(cardStub({ points: 100 }));

      await service.redeemPointsForInvoice(
        { customerId: 'cust-1', points: 30, invoiceId: 'invoice-1' },
        mgr(),
        actor,
      );

      expect(mockManager.findOne).toHaveBeenCalledWith(
        MembershipCardEntity,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.decrement).toHaveBeenCalledWith(
        MembershipCardEntity,
        { id: 'card-1' },
        'points',
        30,
      );
      expect(mockManager.insert).toHaveBeenCalledWith(
        PointHistoryEntity,
        expect.objectContaining({
          cardId: 'card-1',
          invoiceId: 'invoice-1',
          type: PointType.REDEEM,
          delta: -30,
        }),
      );
    });

    it('throws when no active card exists', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(
        service.redeemPointsForInvoice(
          { customerId: 'cust-1', points: 30, invoiceId: 'invoice-1' },
          mgr(),
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.decrement).not.toHaveBeenCalled();
    });

    it('throws when the balance is insufficient', async () => {
      mockManager.findOne.mockResolvedValue(cardStub({ points: 10 }));

      await expect(
        service.redeemPointsForInvoice(
          { customerId: 'cust-1', points: 30, invoiceId: 'invoice-1' },
          mgr(),
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.decrement).not.toHaveBeenCalled();
    });

    it('is a no-op for non-positive points', async () => {
      await service.redeemPointsForInvoice(
        { customerId: 'cust-1', points: 0, invoiceId: 'invoice-1' },
        mgr(),
        actor,
      );
      expect(mockManager.findOne).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // refundRedeemedPoints — re-credit on return
  // =========================================================================
  describe('refundRedeemedPoints', () => {
    const mgr = () => mockManager as unknown as EntityManager;

    it('increments points and records an ADJUST entry', async () => {
      mockManager.findOne.mockResolvedValue(cardStub({ points: 70 }));

      await service.refundRedeemedPoints(
        { customerId: 'cust-1', points: 30, invoiceId: 'return-1' },
        mgr(),
        actor,
      );

      expect(mockManager.increment).toHaveBeenCalledWith(
        MembershipCardEntity,
        { id: 'card-1' },
        'points',
        30,
      );
      expect(mockManager.insert).toHaveBeenCalledWith(
        PointHistoryEntity,
        expect.objectContaining({
          cardId: 'card-1',
          invoiceId: 'return-1',
          type: PointType.ADJUST,
          delta: 30,
        }),
      );
    });

    it('silently skips when the customer has no active card', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await service.refundRedeemedPoints(
        { customerId: 'cust-1', points: 30, invoiceId: 'return-1' },
        mgr(),
        actor,
      );
      expect(mockManager.increment).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // awardPointsForInvoice — earn on checkout (floor(subtotal / 10000))
  // =========================================================================
  describe('awardPointsForInvoice', () => {
    it('credits floor(subtotal / 10000) points — 1.000.000đ earns 100', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub());

      await service.awardPointsForInvoice(
        { id: 'inv-1', customerId: 'cust-1', subtotal: 1_000_000 },
        actor,
      );

      expect(mockManager.increment).toHaveBeenCalledWith(
        MembershipCardEntity,
        { id: 'card-1' },
        'points',
        100,
      );
      expect(mockManager.insert).toHaveBeenCalledWith(
        PointHistoryEntity,
        expect.objectContaining({ type: PointType.EARN, delta: 100 }),
      );
    });

    it('credits nothing below the earn threshold (subtotal < 10.000đ)', async () => {
      cardRepo.findOne.mockResolvedValue(cardStub());

      await service.awardPointsForInvoice(
        { id: 'inv-1', customerId: 'cust-1', subtotal: 9_999 },
        actor,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('no-ops when the customer has no active card', async () => {
      cardRepo.findOne.mockResolvedValue(null);

      await service.awardPointsForInvoice(
        { id: 'inv-1', customerId: 'cust-1', subtotal: 1_000_000 },
        actor,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});

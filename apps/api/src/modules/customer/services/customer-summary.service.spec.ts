import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerService } from '../customer.service';
import { MembershipCardEntity, MembershipTier } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../../pos/entities/invoice.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
} from '../../pos/entities/invoice-debt.entity';
import { CustomerSummaryService } from './customer-summary.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

describe('CustomerSummaryService', () => {
  let service: CustomerSummaryService;
  let invoiceRepo: { find: jest.Mock };
  let debtRepo: { find: jest.Mock };
  let cardRepo: { findOne: jest.Mock };
  let historyRepo: { find: jest.Mock };
  let customerService: { findByIdWithMergeCheck: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { find: jest.fn().mockResolvedValue([]) };
    debtRepo = { find: jest.fn().mockResolvedValue([]) };
    cardRepo = { findOne: jest.fn().mockResolvedValue(null) };
    historyRepo = { find: jest.fn().mockResolvedValue([]) };
    customerService = {
      findByIdWithMergeCheck: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerSummaryService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
        { provide: getRepositoryToken(MembershipCardEntity), useValue: cardRepo },
        { provide: getRepositoryToken(PointHistoryEntity), useValue: historyRepo },
        { provide: CustomerService, useValue: customerService },
      ],
    }).compile();

    service = module.get(CustomerSummaryService);
  });

  it('validates the customer belongs to the org before aggregating', async () => {
    await service.getSummary('customer-1', actor);
    expect(customerService.findByIdWithMergeCheck).toHaveBeenCalledWith(
      'customer-1',
      actor,
    );
  });

  it('queries only SALE invoices in completed statuses', async () => {
    await service.getSummary('customer-1', actor);
    const where = invoiceRepo.find.mock.calls[0][0].where;
    expect(where.type).toBe(InvoiceType.SALE);
    expect(where.organizationId).toBe('org-1');
    // In(...) operator wraps the completed-sale statuses.
    expect(where.status.value).toEqual([
      InvoiceStatus.PAID,
      InvoiceStatus.DEBT,
      InvoiceStatus.PARTIAL_DEBT,
    ]);
  });

  it('sums amountDue and counts invoices for purchases', async () => {
    invoiceRepo.find.mockResolvedValue([
      { amountDue: 100.5 },
      { amountDue: '200.25' },
      { amountDue: 99.25 },
    ]);

    const result = await service.getSummary('customer-1', actor);

    expect(result.purchases.totalSpending).toBe(400);
    expect(result.purchases.invoiceCount).toBe(3);
  });

  it('queries only open/overdue debts and sums remainingAmount', async () => {
    debtRepo.find.mockResolvedValue([
      { remainingAmount: 50 },
      { remainingAmount: '25.5' },
    ]);

    const result = await service.getSummary('customer-1', actor);

    const where = debtRepo.find.mock.calls[0][0].where;
    expect(where.status.value).toEqual([DebtStatus.OPEN, DebtStatus.OVERDUE]);
    expect(result.debt.totalOutstanding).toBe(75.5);
    expect(result.debt.documentCount).toBe(2);
  });

  it('returns membership null when the customer has no card', async () => {
    cardRepo.findOne.mockResolvedValue(null);

    const result = await service.getSummary('customer-1', actor);

    expect(result.membership).toBeNull();
    expect(historyRepo.find).not.toHaveBeenCalled();
  });

  it('builds membership block with pointsUsed = sum of |REDEEM delta|', async () => {
    cardRepo.findOne.mockResolvedValue({
      id: 'card-1',
      cardNumber: 'MCAB123456',
      tier: MembershipTier.GOLD,
      points: 120,
    });
    historyRepo.find.mockResolvedValue([
      { delta: -30, type: PointType.REDEEM },
      { delta: -20, type: PointType.REDEEM },
    ]);

    const result = await service.getSummary('customer-1', actor);

    expect(historyRepo.find).toHaveBeenCalledWith({
      where: { cardId: 'card-1', type: PointType.REDEEM },
    });
    expect(result.membership).toEqual({
      cardNumber: 'MCAB123456',
      tier: MembershipTier.GOLD,
      points: 120,
      pointsUsed: 50,
    });
  });
});

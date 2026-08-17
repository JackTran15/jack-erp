import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReturnEligibilityService } from './return-eligibility.service';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import {
  InvoiceDebtEntity,
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('ReturnEligibilityService.getOutstandingDebt', () => {
  let service: ReturnEligibilityService;
  let invoiceRepo: { findOne: jest.Mock };
  let debtRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { findOne: jest.fn() };
    debtRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnEligibilityService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        {
          provide: getRepositoryToken(InvoiceItemEntity),
          useValue: { find: jest.fn() },
        },
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
      ],
    }).compile();

    service = module.get(ReturnEligibilityService);
  });

  it('returns the outstanding remainder of a credit sale', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '465000.00',
      status: DebtStatus.OPEN,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 465000,
    });
    expect(debtRepo.findOne).toHaveBeenCalledWith({
      where: {
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        documentType: DebtDocumentType.CREDIT_INVOICE,
      },
    });
  });

  it('returns 0 when the invoice carries no debt row', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue(null);

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('returns 0 when the debt has been settled', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '0.00',
      status: DebtStatus.PAID,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('clamps a negative remainder from legacy data to 0', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '-1200.00',
      status: DebtStatus.OPEN,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('404s for an invoice outside the actor organisation', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);

    await expect(service.getOutstandingDebt('inv-1', actor)).rejects.toThrow(
      NotFoundException,
    );
    expect(debtRepo.findOne).not.toHaveBeenCalled();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventPublisher } from '../../events/event-publisher.service';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { OverdueDebtsService } from './overdue-debts.service';

function overdueDebtStub(
  overrides: Partial<InvoiceDebtEntity> = {},
): InvoiceDebtEntity {
  return {
    id: 'debt-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: 'cust-1',
    dueDate: '2000-01-01',
    remainingAmount: 1305000,
    status: DebtStatus.OPEN,
    ...overrides,
  } as InvoiceDebtEntity;
}

describe('OverdueDebtsService', () => {
  let service: OverdueDebtsService;
  let debtRepo: { find: jest.Mock; save: jest.Mock };
  let events: { publish: jest.Mock };

  beforeEach(async () => {
    debtRepo = {
      find: jest.fn(),
      save: jest.fn((d) => Promise.resolve(d)),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverdueDebtsService,
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
        { provide: EventPublisher, useValue: events },
      ],
    }).compile();

    service = module.get(OverdueDebtsService);
  });

  it('flips overdue OPEN debts to OVERDUE and publishes one event each', async () => {
    const debt = overdueDebtStub();
    debtRepo.find.mockResolvedValue([debt]);

    await service.markOverdue();

    expect(debt.status).toBe(DebtStatus.OVERDUE);
    expect(debtRepo.save).toHaveBeenCalledWith(debt);
    expect(events.publish).toHaveBeenCalledTimes(1);
    const [topic, event, key] = events.publish.mock.calls[0];
    expect(topic).toBe('erp.debt.overdue');
    expect(key).toBe('debt-1');
    expect(event.eventId).toBe('debt-overdue-debt-1-2000-01-01');
    expect(event.payload).toEqual({
      debtId: 'debt-1',
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      dueDate: '2000-01-01',
      remainingAmount: 1305000,
    });
  });

  it('does nothing when no debts are overdue', async () => {
    debtRepo.find.mockResolvedValue([]);

    await service.markOverdue();

    expect(debtRepo.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('uses a deterministic eventId so re-runs replay as no-ops', async () => {
    debtRepo.find.mockResolvedValue([overdueDebtStub()]);
    await service.markOverdue();
    debtRepo.find.mockResolvedValue([overdueDebtStub()]);
    await service.markOverdue();

    expect(events.publish.mock.calls[0][1].eventId).toBe(
      events.publish.mock.calls[1][1].eventId,
    );
  });
});

import { ConflictException } from '@nestjs/common';
import { DomainEvent } from '@erp/shared-interfaces';
import { DepositRefundConsumer } from './deposit-refund.consumer';
import { DepositRefundService } from './deposit-refund.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';

function event(over: Partial<InvoiceCancelledPayload> = {}): DomainEvent<InvoiceCancelledPayload> {
  return {
    payload: {
      invoiceId: 'inv-1',
      documentNumber: 'HD001',
      reason: 'Khách hủy',
      branchId: 'branch-1',
      items: [],
      organizationId: 'org-1',
      actorId: 'user-1',
      ...over,
    },
  } as DomainEvent<InvoiceCancelledPayload>;
}

describe('DepositRefundConsumer', () => {
  it('calls reverseForCancelledInvoice with the actor built from the event payload', async () => {
    const refund = {
      reverseForCancelledInvoice: jest.fn().mockResolvedValue({ reversedCount: 1, movementIds: ['mv-1'] }),
    };
    const consumer = new DepositRefundConsumer(refund as unknown as DepositRefundService);

    await consumer.handle(event());

    expect(refund.reverseForCancelledInvoice).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1' }),
    );
  });

  it('swallows a BR-REF-02 (reconciled) block instead of throwing', async () => {
    const refund = {
      reverseForCancelledInvoice: jest
        .fn()
        .mockRejectedValue(new ConflictException('already reconciled (BR-REF-02)')),
    };
    const consumer = new DepositRefundConsumer(refund as unknown as DepositRefundService);

    await expect(consumer.handle(event())).resolves.toBeUndefined();
  });

  it('re-throws a BR-LOCK-01 block so the DLQ machinery retries/dead-letters it', async () => {
    const refund = {
      reverseForCancelledInvoice: jest
        .fn()
        .mockRejectedValue(new ConflictException('Period 2026-07 is locked (BR-LOCK-01)')),
    };
    const consumer = new DepositRefundConsumer(refund as unknown as DepositRefundService);

    await expect(consumer.handle(event())).rejects.toThrow(/BR-LOCK-01/);
  });

  it('skips events with no branchId', async () => {
    const refund = { reverseForCancelledInvoice: jest.fn() };
    const consumer = new DepositRefundConsumer(refund as unknown as DepositRefundService);

    await consumer.handle(event({ branchId: undefined }));

    expect(refund.reverseForCancelledInvoice).not.toHaveBeenCalled();
  });
});

import { DomainEvent, DepositMovementSource } from '@erp/shared-interfaces';
import { RefundBankConsumer } from './refund-bank.consumer';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankPaymentPurpose, BankPaymentReferenceType } from '../enums';
import { DepositRefundPayload } from '../../publishers/deposit-refund.publisher';

function event(
  over: Partial<DepositRefundPayload> = {},
): DomainEvent<DepositRefundPayload> {
  return {
    payload: {
      returnInvoiceId: 'ret-1',
      returnInvoiceCode: 'RTN-0001',
      depositAccountId: 'deposit-1',
      contraAccountId: 'coa-rev',
      amount: 200000,
      docDate: '2026-07-23',
      branchId: 'br1',
      organizationId: 'org1',
      actorId: 'u1',
      ...over,
    },
  } as DomainEvent<DepositRefundPayload>;
}

describe('RefundBankConsumer', () => {
  let consumer: RefundBankConsumer;
  let bankPayments: { createAndPostInternal: jest.Mock };

  beforeEach(() => {
    bankPayments = {
      createAndPostInternal: jest.fn().mockResolvedValue({
        voucherId: 'pc-1',
        voucherNumber: 'PC-0001',
        depositMovementId: 'mv-1',
        journalEntryId: 'je-1',
      }),
    };
    consumer = new RefundBankConsumer(
      bankPayments as unknown as BankPaymentsService,
    );
  });

  it('posts a REFUND bank payment on the resolved deposit fund, keyed on the return invoice', async () => {
    await consumer.handle(event());

    expect(bankPayments.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(bankPayments.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: BankPaymentPurpose.REFUND,
        depositAccountId: 'deposit-1',
        contraAccountId: 'coa-rev',
        amount: 200000,
        docDate: '2026-07-23',
        referenceType: BankPaymentReferenceType.REFUND,
        referenceId: 'ret-1',
        source: DepositMovementSource.POS_INVOICE,
        sourceRefLineId: 'REFUND',
        actor: expect.objectContaining({
          userId: 'u1',
          organizationId: 'org1',
          branchId: 'br1',
        }),
      }),
    );
  });

  it('is a no-op on replay — createAndPostInternal is idempotent by (REFUND, returnInvoiceId)', async () => {
    // A re-delivered event returns the already-created voucher without a second post.
    await expect(consumer.handle(event())).resolves.toBeUndefined();
    expect(bankPayments.createAndPostInternal).toHaveBeenCalledTimes(1);
  });
});

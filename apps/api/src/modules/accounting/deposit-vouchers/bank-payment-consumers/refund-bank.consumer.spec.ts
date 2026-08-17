import { DomainEvent, DepositMovementSource } from '@erp/shared-interfaces';
import { RefundBankConsumer } from './refund-bank.consumer';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  BankVoucherPartnerType,
} from '../enums';
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

const PARTY_ROW = {
  customer_id: 'cust-1',
  staff_id: 'user-cashier',
  salesperson_id: 'profile-1',
  customer_name: 'Nguyễn Văn A',
  customer_address: '12 Lê Lợi',
  branch_address: '45 Nguyễn Huệ',
  salesperson_user_id: 'user-salesperson',
};

/** DataSource stubbed down to the single query `buildPosInvoiceParty` runs. */
function dataSourceReturning(rows: unknown[]) {
  return { manager: { query: jest.fn().mockResolvedValue(rows) } };
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
      dataSourceReturning([PARTY_ROW]) as any,
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

  it('names the customer and puts the staff member in paidBy, not staffId (AC-07)', async () => {
    await consumer.handle(event());

    const args = bankPayments.createAndPostInternal.mock.calls[0][0];
    expect(args).toEqual(
      expect.objectContaining({
        partnerType: BankVoucherPartnerType.CUSTOMER,
        partnerId: 'cust-1',
        partnerName: 'Nguyễn Văn A',
        partnerAddress: '12 Lê Lợi',
        payeeName: 'Nguyễn Văn A',
        paidBy: 'user-salesperson',
      }),
    );
    // bank_payments has no staff_id column — passing one would silently drop the field.
    expect(args.staffId).toBeUndefined();
  });

  it('still posts the refund when the return invoice resolves no customer (AC-07, AC-14)', async () => {
    consumer = new RefundBankConsumer(
      bankPayments as unknown as BankPaymentsService,
      dataSourceReturning([
        { ...PARTY_ROW, customer_id: null, customer_name: null, customer_address: null },
      ]) as any,
    );

    await consumer.handle(event());

    const args = bankPayments.createAndPostInternal.mock.calls[0][0];
    expect(args.amount).toBe(200000);
    expect(args.partnerType).toBeUndefined();
    expect(args.payeeName).toBeUndefined();
    expect(args.paidBy).toBe('user-salesperson');
  });

  it('is a no-op on replay — createAndPostInternal is idempotent by (REFUND, returnInvoiceId)', async () => {
    // A re-delivered event returns the already-created voucher without a second post.
    await expect(consumer.handle(event())).resolves.toBeUndefined();
    expect(bankPayments.createAndPostInternal).toHaveBeenCalledTimes(1);
  });
});

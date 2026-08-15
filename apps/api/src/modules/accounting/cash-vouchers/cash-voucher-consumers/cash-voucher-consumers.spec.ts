import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { PosCashSaleConsumer } from './pos-cash-sale.consumer';
import { PosKeptChangeConsumer } from './pos-kept-change.consumer';
import { ExpenseCashConsumer } from './expense-cash.consumer';
import { RefundCashConsumer } from './refund-cash.consumer';
import { CashReceiptPurpose, CashReceiptReferenceType, CashVoucherPartnerType } from '../enums';

/**
 * A DataSource stubbed down to the one query `buildPosInvoiceParty` runs. Pass no rows to
 * simulate an invoice the lookup cannot resolve.
 */
function dataSourceReturning(rows: unknown[]) {
  return { manager: { query: jest.fn().mockResolvedValue(rows) } };
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

describe('Cash voucher consumers', () => {
  describe('PosCashSaleConsumer', () => {
    it('creates movement+JE+receipt and publishes CASH_VOUCHER_CREATED', async () => {
      const receipts = {
        createAndPostInternal: jest.fn().mockResolvedValue({
          voucherId: 'r-1',
          voucherNumber: 'PT-26-00001',
          cashMovementId: 'mv-1',
          journalEntryId: 'je-1',
        }),
      };
      const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
      const consumer = new PosCashSaleConsumer(
        receipts as any,
        publisher as any,
        dataSourceReturning([PARTY_ROW]) as any,
      );

      const event: DomainEvent<any> = {
        eventId: 'evt-1',
        eventType: 'CASH_MOVEMENT_FROM_PAYMENT_REQUESTED' as any,
        timestamp: new Date().toISOString(),
        organizationId: 'org-1',
        branchId: 'b-1',
        correlationId: 'corr-1',
        payload: {
          invoiceId: 'inv-1',
          invoiceCode: 'SAL-1',
          cashAccountId: 'cash-1',
          contraAccountId: 'rev-1',
          amount: 500,
          organizationId: 'org-1',
          branchId: 'b-1',
          actorId: 'u-1',
        },
      };

      await consumer.handle(event);

      expect(receipts.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'inv-1',
          amount: 500,
          cashAccountId: 'cash-1',
          contraAccountId: 'rev-1',
        }),
      );
      expect(publisher.publish).toHaveBeenCalledWith(
        ERP_TOPICS.CASH_VOUCHER_CREATED,
        expect.objectContaining({
          payload: expect.objectContaining({
            sourceType: 'POS_SALE',
            voucherId: 'r-1',
            cashMovementId: 'mv-1',
          }),
        }),
      );
    });
  });

  describe('PosCashSaleConsumer — party fields (AC-01, AC-02, AC-14)', () => {
    function makeEvent(): DomainEvent<any> {
      return {
        eventId: 'evt-party',
        eventType: 'CASH_MOVEMENT_FROM_PAYMENT_REQUESTED' as any,
        timestamp: new Date().toISOString(),
        organizationId: 'org-1',
        branchId: 'b-1',
        correlationId: 'corr-party',
        payload: {
          invoiceId: 'inv-1',
          invoiceCode: 'SAL-1',
          cashAccountId: 'cash-1',
          contraAccountId: 'rev-1',
          amount: 500,
          organizationId: 'org-1',
          branchId: 'b-1',
          actorId: 'u-1',
        },
      };
    }

    function makeConsumer(rows: unknown[]) {
      const receipts = {
        createAndPostInternal: jest.fn().mockResolvedValue({
          voucherId: 'r-1',
          voucherNumber: 'PT-26-00002',
          cashMovementId: 'mv-1',
          journalEntryId: 'je-1',
        }),
      };
      const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
      const consumer = new PosCashSaleConsumer(
        receipts as any,
        publisher as any,
        dataSourceReturning(rows) as any,
      );
      return { consumer, receipts };
    }

    it('passes the invoice customer, address and salesperson to the receipt (AC-01)', async () => {
      const { consumer, receipts } = makeConsumer([PARTY_ROW]);

      await consumer.handle(makeEvent());

      expect(receipts.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerType: CashVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          partnerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          payerName: 'Nguyễn Văn A',
          staffId: 'user-salesperson',
        }),
      );
    });

    it('keeps reason, reference and amount untouched while adding the party (AC-01)', async () => {
      const { consumer, receipts } = makeConsumer([PARTY_ROW]);

      await consumer.handle(makeEvent());

      expect(receipts.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: CashReceiptPurpose.POS_SALE,
          referenceType: CashReceiptReferenceType.INVOICE,
          referenceId: 'inv-1',
          amount: 500,
          reason: 'POS sale SAL-1',
        }),
      );
    });

    it('leaves the party empty for a walk-in sale (AC-02)', async () => {
      const { consumer, receipts } = makeConsumer([
        { ...PARTY_ROW, customer_id: null, customer_name: null, customer_address: null },
      ]);

      await consumer.handle(makeEvent());

      const args = receipts.createAndPostInternal.mock.calls[0][0];
      expect(args.partnerType).toBeUndefined();
      expect(args.partnerId).toBeUndefined();
      expect(args.payerName).toBeUndefined();
      expect(args.partnerAddress).toBe('45 Nguyễn Huệ');
      expect(args.staffId).toBe('user-salesperson');
    });

    it('still writes the receipt when the invoice lookup finds nothing (AC-14)', async () => {
      // The money is already in the drawer. A party lookup that comes back empty must not
      // dead-letter the voucher that records it.
      const { consumer, receipts } = makeConsumer([]);

      await expect(consumer.handle(makeEvent())).resolves.toBeUndefined();

      const args = receipts.createAndPostInternal.mock.calls[0][0];
      expect(args.amount).toBe(500);
      expect(args.partnerId).toBeUndefined();
      expect(args.staffId).toBeUndefined();
    });
  });

  describe('PosKeptChangeConsumer — party fields (AC-05)', () => {
    it('carries the same party onto the other-income receipt', async () => {
      const receipts = {
        createAndPostInternal: jest.fn().mockResolvedValue({
          voucherId: 'r-2',
          voucherNumber: 'PT-26-00003',
          cashMovementId: 'mv-2',
          journalEntryId: 'je-2',
        }),
      };
      const accountResolver = { resolveDefaultAccount: jest.fn().mockResolvedValue('711') };
      const categoryResolver = { resolveId: jest.fn().mockResolvedValue('cat-thu-khac') };
      const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
      const consumer = new PosKeptChangeConsumer(
        receipts as any,
        accountResolver as any,
        categoryResolver as any,
        publisher as any,
        dataSourceReturning([PARTY_ROW]) as any,
      );

      await consumer.handle({
        eventId: 'evt-kc',
        eventType: 'CASH_VOUCHER_NEEDED_KEPT_CHANGE' as any,
        timestamp: new Date().toISOString(),
        organizationId: 'org-1',
        branchId: 'b-1',
        correlationId: 'corr-kc',
        payload: {
          invoiceId: 'inv-1',
          invoiceCode: 'SAL-1',
          cashAccountId: 'cash-1',
          amount: 5000,
          organizationId: 'org-1',
          branchId: 'b-1',
          actorId: 'u-1',
        },
      } as DomainEvent<any>);

      expect(receipts.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          // The surplus stays other income against its own reference type — only the party
          // is new here.
          purpose: CashReceiptPurpose.OTHER_INCOME,
          referenceType: CashReceiptReferenceType.INVOICE_KEPT_CHANGE,
          partnerType: CashVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          payerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          staffId: 'user-salesperson',
        }),
      );
    });
  });

  describe('RefundCashConsumer — party fields (AC-06, AC-08)', () => {
    function makeConsumer(rows: unknown[]) {
      // The consumer wraps its work in dataSource.transaction; hand the callback a manager
      // that answers both the duplicate-movement guard and the party lookup.
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        query: jest.fn().mockResolvedValue(rows),
      };
      const dataSource = { transaction: (cb: any) => cb(manager) };
      const cashService = {
        recordMovement: jest
          .fn()
          .mockResolvedValue({ movement: { id: 'mv-r' }, journalEntryId: 'je-r' }),
      };
      const payments = {
        createVoucherForMovement: jest
          .fn()
          .mockResolvedValue({ voucherId: 'pc-1', voucherNumber: 'PC-26-00009' }),
      };
      const categoryResolver = { resolveId: jest.fn().mockResolvedValue('cat-chi-khac') };
      const consumer = new RefundCashConsumer(
        dataSource as any,
        cashService as any,
        payments as any,
        categoryResolver as any,
      );
      return { consumer, payments };
    }

    const event: DomainEvent<any> = {
      eventId: 'evt-refund',
      eventType: 'CASH_REFUND_REQUESTED' as any,
      timestamp: new Date().toISOString(),
      organizationId: 'org-1',
      branchId: 'b-1',
      correlationId: 'corr-refund',
      payload: {
        returnInvoiceId: 'rtn-1',
        returnInvoiceCode: 'RTN-1',
        cashAccountId: 'cash-1',
        contraAccountId: 'rev-1',
        amount: 300,
        organizationId: 'org-1',
        branchId: 'b-1',
        actorId: 'u-1',
      },
    };

    it('names the customer the refund goes back to (AC-06)', async () => {
      const { consumer, payments } = makeConsumer([PARTY_ROW]);

      await consumer.handle(event);

      expect(payments.createVoucherForMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerType: CashVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          partnerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          // payee, not payer — the cash is going out.
          payeeName: 'Nguyễn Văn A',
          staffId: 'user-salesperson',
        }),
        expect.anything(),
      );
    });

    it('still issues the voucher for a quick return with no customer (AC-08)', async () => {
      const { consumer, payments } = makeConsumer([
        { ...PARTY_ROW, customer_id: null, customer_name: null, customer_address: null },
      ]);

      await consumer.handle(event);

      const args = payments.createVoucherForMovement.mock.calls[0][0];
      expect(args.partnerType).toBeUndefined();
      expect(args.payeeName).toBeUndefined();
      expect(args.amount).toBe(300);
      expect(args.staffId).toBe('user-salesperson');
    });
  });

  describe('ExpenseCashConsumer', () => {
    it('links existing movement+JE via createVoucherForMovement (no new movement/JE)', async () => {
      const payments = {
        createVoucherForMovement: jest.fn().mockResolvedValue({
          voucherId: 'p-1',
          voucherNumber: 'PC-26-00001',
        }),
        createAndPostInternal: jest.fn(),
      };
      const resolver = { resolveId: jest.fn().mockResolvedValue('cat-1') };
      const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
      const consumer = new ExpenseCashConsumer(
        payments as any,
        resolver as any,
        publisher as any,
      );

      const event: DomainEvent<any> = {
        eventId: 'evt-2',
        eventType: 'CASH_VOUCHER_NEEDED' as any,
        timestamp: new Date().toISOString(),
        organizationId: 'org-1',
        branchId: 'b-1',
        correlationId: 'corr-2',
        payload: {
          sourceType: 'EXPENSE',
          sourceId: 'exp-1',
          amount: 200,
          cashAccountId: 'cash-1',
          contraAccountId: 'exp-acc',
          cashMovementId: 'mv-9',
          journalEntryId: 'je-9',
          organizationId: 'org-1',
          branchId: 'b-1',
          actorId: 'u-1',
        },
      };

      await consumer.handle(event);

      // Voucher-only creation links the pre-existing movement + JE.
      expect(payments.createVoucherForMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          cashMovementId: 'mv-9',
          journalEntryId: 'je-9',
          referenceId: 'exp-1',
        }),
      );
      expect(payments.createAndPostInternal).not.toHaveBeenCalled();
      expect(publisher.publish).toHaveBeenCalledWith(
        ERP_TOPICS.CASH_VOUCHER_CREATED,
        expect.objectContaining({
          payload: expect.objectContaining({
            sourceType: 'EXPENSE',
            voucherKind: 'CASH_PAYMENT',
            journalEntryId: 'je-9',
          }),
        }),
      );
    });
  });
});

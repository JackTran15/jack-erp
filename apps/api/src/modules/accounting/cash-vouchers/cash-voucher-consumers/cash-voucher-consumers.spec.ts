import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { PosCashSaleConsumer } from './pos-cash-sale.consumer';
import { ExpenseCashConsumer } from './expense-cash.consumer';

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

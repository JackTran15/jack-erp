import { getMetadataArgsStorage } from 'typeorm';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';
import { BankReceiptEntity } from '../../deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankPaymentEntity } from '../../deposit-vouchers/bank-payments/bank-payment.entity';

/**
 * `revision` is the optimistic-concurrency token for editing a posted voucher
 * (ADR-06). Two properties of the column are load-bearing and easy to lose in a
 * later refactor, so they are asserted rather than assumed:
 *
 *  - `default: 0`, because every voucher that existed before the column did is
 *    at revision 0, and the concurrency check must never compare against NULL.
 *  - present on ALL FOUR tables. The two treasury modules carry parallel
 *    entities, and the whole risk of this feature is changing one side and
 *    forgetting the other.
 *
 * Read from TypeORM's metadata storage rather than a live connection so this
 * stays a unit test.
 */
describe('treasury voucher revision column', () => {
  const entities = [
    ['CashReceiptEntity', CashReceiptEntity],
    ['CashPaymentEntity', CashPaymentEntity],
    ['BankReceiptEntity', BankReceiptEntity],
    ['BankPaymentEntity', BankPaymentEntity],
  ] as const;

  it.each(entities)('%s declares revision', (_name, target) => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === target && c.propertyName === 'revision',
    );

    expect(column).toBeDefined();
    expect(column?.options.default).toBe(0);
    expect(column?.options.nullable).toBeFalsy();
  });

  it('gives a freshly constructed voucher no revision until the DB default applies', () => {
    // The default lives in Postgres, not in the class — a new instance is
    // undefined, and an existing row reads back 0. Pinning this stops anyone
    // "fixing" it with a field initialiser, which would make every in-memory
    // voucher claim revision 0 and silently pass a staleness check it should
    // have failed.
    expect(new CashReceiptEntity().revision).toBeUndefined();
  });
});

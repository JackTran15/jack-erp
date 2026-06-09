import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { CashVoucherDocumentType } from './cash-voucher-search.dto';
import { SearchCashVouchersHandler } from './search-cash-vouchers.handler';
import { SearchCashVouchersQuery } from './search-cash-vouchers.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('SearchCashVouchersHandler', () => {
  let handler: SearchCashVouchersHandler;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          kind: 'RECEIPT',
          id: 'receipt-1',
          voucherDate: '2026-06-01',
          documentNumber: 'PT0001',
          totalAmount: 1000,
          counterparty: 'Acme',
          receipt: { id: 'receipt-1', lines: [] },
        },
      ])
      .mockResolvedValueOnce([{ total: 7 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCashVouchersHandler,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    handler = module.get(SearchCashVouchersHandler);
  });

  const run = (dto: Record<string, unknown>) =>
    handler.execute(new SearchCashVouchersQuery(dto, actor));
  const dataCall = () => query.mock.calls[0] as [string, unknown[]];

  it('unifies receipts and payments at DB level and returns the paginated envelope', async () => {
    const result = await run({ page: 2, limit: 5 });
    const [sql, params] = dataCall();

    expect(sql).toContain('FROM cash_receipts');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('FROM cash_payments');
    expect(sql).toContain('ORDER BY "voucherDate" DESC, id DESC');
    expect(params.slice(-2)).toEqual([5, 5]);
    expect(result).toEqual({
      data: expect.any(Array),
      total: 7,
      page: 2,
      limit: 5,
    });
  });

  it('always scopes organization and defaults to the actor branch', async () => {
    await run({});
    const [sql, params] = dataCall();

    expect(sql.match(/organization_id = \$1/g)).toHaveLength(2);
    expect(sql.match(/branch_id = \$2/g)).toHaveLength(2);
    expect(params.slice(0, 2)).toEqual(['org-1', 'branch-1']);
    expect(sql.match(/deleted_at IS NULL/g)).toHaveLength(2);
  });

  it('uses cashAccountId scope instead of actor branch when supplied', async () => {
    const cashAccountId = '11111111-1111-4111-8111-111111111111';
    await run({ cashAccountId });
    const [sql, params] = dataCall();

    expect(sql.match(/cash_account_id = \$2/g)).toHaveLength(2);
    expect(sql).not.toContain('branch_id = $2');
    expect(params.slice(0, 2)).toEqual(['org-1', cashAccountId]);
  });

  it('applies unified filters outside the union with bound parameters', async () => {
    await run({
      voucherDate: { from: '2026-01-01', to: '2026-01-31' },
      documentNumber: { operator: StringOperator.CONTAINS, value: 'PT' },
      documentType: { value: CashVoucherDocumentType.GOODS_RECEIPT_PAYMENT },
      totalAmount: { operator: CompareOperator.GTE, value: 1000 },
      counterparty: { operator: StringOperator.CONTAINS, value: 'Acme' },
      reason: { operator: StringOperator.NOT_CONTAINS, value: 'cancelled' },
    });
    const [sql, params] = dataCall();

    expect(sql).toContain('"voucherDate" >= ');
    expect(sql).toContain('"voucherDate" < ');
    expect(sql).toContain('COALESCE("documentNumber", \'\') ILIKE');
    expect(sql).toContain('"documentType" =');
    expect(sql).toContain('"totalAmount" >=');
    expect(sql).toContain('COALESCE(counterparty, \'\') ILIKE');
    expect(sql).toContain('COALESCE(reason, \'\') NOT ILIKE');
    expect(params).toEqual(
      expect.arrayContaining([
        'org-1',
        'branch-1',
        '2026-01-01',
        '2026-01-31',
        '%PT%',
        CashVoucherDocumentType.GOODS_RECEIPT_PAYMENT,
        1000,
        '%Acme%',
        '%cancelled%',
      ]),
    );
  });

  it('projects ReceiptPaymentListItem fields and raw detail payloads', async () => {
    await run({});
    const [sql] = dataCall();

    expect(sql).toContain(`'RECEIPT' AS kind`);
    expect(sql).toContain(`'PAYMENT' AS kind`);
    expect(sql).toContain(`'cash_receipt' AS "documentType"`);
    expect(sql).toContain(`'goods_receipt_payment'`);
    expect(sql).toContain(`'cash_payment'`);
    expect(sql).toContain(`jsonb_build_object`);
    expect(sql).toContain(`'lines'`);
    expect(sql).toContain(`AS receipt`);
    expect(sql).toContain(`AS payment`);
  });

  it('casts source-specific Postgres enums before unioning them', async () => {
    await run({});
    const [sql] = dataCall();

    expect(sql.match(/\.status::text/g)).toHaveLength(2);
    expect(sql.match(/\.reference_type::text AS "referenceType"/g)).toHaveLength(2);
  });
});

import { PromotionStatus } from '@erp/shared-interfaces';
import { StringOperator } from '../../../../common/filters/filter.dto';
import { SearchVouchersV2Handler } from './search-vouchers-v2.handler';
import { SearchVouchersV2Query } from './search-vouchers-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { VoucherEntity } from '../../voucher.entity';

interface WhereCall {
  sql: string;
  params?: Record<string, unknown>;
}

function makeQueryBuilderRepo(rows: Partial<VoucherEntity>[]) {
  const whereCalls: WhereCall[] = [];
  const qb: any = {
    where(sql: string, params?: Record<string, unknown>) {
      whereCalls.push({ sql, params });
      return qb;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      whereCalls.push({ sql, params });
      return qb;
    },
    orderBy() {
      return qb;
    },
    async getMany() {
      return rows as VoucherEntity[];
    },
  };
  const repo = { createQueryBuilder: () => qb };
  return { repo, whereCalls };
}

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function aVoucherRow(overrides: Partial<VoucherEntity> = {}): Partial<VoucherEntity> {
  return {
    id: 'voucher-1',
    code: 'V1',
    issuer: 'Shop A',
    description: undefined,
    faceValue: 100_000 as unknown as number,
    validFrom: new Date(2026, 0, 1),
    validTo: new Date(2026, 11, 31),
    status: PromotionStatus.TRACKING,
    isUsed: false,
    ...overrides,
  };
}

describe('SearchVouchersV2Handler', () => {
  it('always filters by organizationId', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo([]);
    const handler = new SearchVouchersV2Handler(repo as any);

    await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(whereCalls[0]).toMatchObject({ sql: 'v.organizationId = :orgId', params: { orgId: 'org-1' } });
  });

  it('applies the issuer StringFilterDto', async () => {
    const { repo, whereCalls } = makeQueryBuilderRepo([]);
    const handler = new SearchVouchersV2Handler(repo as any);

    await handler.execute(new SearchVouchersV2Query({ issuer: { operator: StringOperator.CONTAINS, value: 'Shop' } }, actor));

    expect(whereCalls.some((c) => c.sql.includes('v.issuer') && c.sql.includes('ILIKE'))).toBe(true);
  });

  it('computes totalQuantity=1, totalVoucherValue=faceValue, totalAppliedValue=0 for an unused voucher (code is unique per org)', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow({ code: 'V1', faceValue: 150_000 as unknown as number, isUsed: false })]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.data).toEqual([
      expect.objectContaining({ code: 'V1', totalQuantity: 1, totalVoucherValue: 150_000, totalAppliedValue: 0 }),
    ]);
  });

  // Without an id the toolbar cannot call PUT/duplicate/DELETE on the selected
  // row — the 10 display columns of FR-050 alone are not enough to act on a row.
  it('carries the row id so the client can edit, duplicate or deactivate it', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow({ id: 'voucher-42', code: 'V9' })]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.data[0]).toMatchObject({ id: 'voucher-42', code: 'V9' });
  });

  it('counts totalAppliedValue only for used vouchers', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow({ code: 'V1', faceValue: 200_000 as unknown as number, isUsed: true })]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.data[0]).toMatchObject({ totalAppliedValue: 200_000 });
  });

  it('formats validFrom/validTo as startDate/endDate ISO date strings', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow({ validFrom: new Date(2026, 0, 1), validTo: new Date(2026, 11, 31) })]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.data[0].startDate).toBe('2026-01-01');
    expect(result.data[0].endDate).toBe('2026-12-31');
  });

  it('leaves startDate/endDate undefined for an unlimited-duration voucher', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow({ validFrom: undefined, validTo: undefined })]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.data[0].startDate).toBeUndefined();
    expect(result.data[0].endDate).toBeUndefined();
  });

  it('summary totals cover the whole filtered set, not just the current page', async () => {
    const { repo } = makeQueryBuilderRepo([
      aVoucherRow({ code: 'V1', faceValue: 100_000 as unknown as number, isUsed: true }),
      aVoucherRow({ code: 'V2', faceValue: 200_000 as unknown as number, isUsed: false }),
      aVoucherRow({ code: 'V3', faceValue: 300_000 as unknown as number, isUsed: true }),
    ]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({ page: 1, limit: 1 }, actor));

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.summary).toEqual({ totalQuantity: 3, totalVoucherValue: 600_000, totalAppliedValue: 400_000 });
  });

  it('defaults to page 1, limit 50', async () => {
    const { repo } = makeQueryBuilderRepo([aVoucherRow()]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({}, actor));

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('honors custom page/limit for slicing the grouped result', async () => {
    const { repo } = makeQueryBuilderRepo([
      aVoucherRow({ code: 'V1' }),
      aVoucherRow({ code: 'V2' }),
      aVoucherRow({ code: 'V3' }),
    ]);
    const handler = new SearchVouchersV2Handler(repo as any);

    const result = await handler.execute(new SearchVouchersV2Query({ page: 2, limit: 1 }, actor));

    expect(result.data).toHaveLength(1);
    expect(result.data[0].code).toBe('V2');
  });
});

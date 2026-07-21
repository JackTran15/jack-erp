import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  DateRangeFilterDto,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import {
  CashVoucherRowDto,
  CashVoucherSearchV2ResponseDto,
} from '../dto/cash-voucher-search-v2.dto';
import { SearchCashVouchersV2Query } from './search-cash-vouchers-v2.query';

/**
 * Merged cash voucher search. `cash_receipts` and `cash_payments` are two tables
 * with no shared entity, so this is pushed to SQL as a UNION ALL CTE rather than
 * a TypeORM QueryBuilder — FilterBuilder needs a SelectQueryBuilder<Entity> and
 * cannot span both. Mirrors SearchDepositVouchersV2Handler.
 *
 * Filtering, ordering, pagination and the total-amount sum all run at the DB, so
 * the caller never loads the org's full voucher set to filter it in memory.
 *
 * voucher_date is cast to ::text so callers always receive 'YYYY-MM-DD'
 * regardless of the driver's DATE parsing.
 */
function buildCte(orgIdx: number, branchIdx?: number, accountIdx?: number): string {
  const scope = (alias: string): string => {
    const parts = [`${alias}.organization_id = $${orgIdx}`, `${alias}.deleted_at IS NULL`];
    if (branchIdx) parts.push(`${alias}.branch_id = $${branchIdx}`);
    if (accountIdx) parts.push(`${alias}.cash_account_id = $${accountIdx}`);
    return parts.join(' AND ');
  };

  return `
    WITH combined AS (
      SELECT
        'CASH_RECEIPT'                             AS "documentKind",
        'RECEIPT'                                  AS kind,
        r.id                                       AS id,
        r.created_at                               AS "createdAt",
        r.voucher_date::text                       AS "voucherDate",
        r.document_number                          AS "documentNumber",
        r.status::text                             AS status,
        r.total_amount::float                      AS "totalAmount",
        r.cash_account_id                          AS "cashAccountId",
        -- receipts and payments use DIFFERENT reference_type enum types, so both
        -- sides must be text or the UNION cannot match them.
        r.reference_type::text                     AS "referenceType",
        r.reason                                   AS reason,
        COALESCE(
          NULLIF(btrim(r.payer_name), ''),
          NULLIF(btrim(r.partner_name_snapshot), ''),
          ''
        )                                          AS counterparty
      FROM cash_receipts r
      WHERE ${scope('r')}

      UNION ALL

      SELECT
        -- The grid renders a goods-receipt payment as its own document type, so
        -- the filterable value has to distinguish it from a plain payment.
        CASE
          WHEN p.reference_type::text = 'GOODS_RECEIPT' THEN 'GOODS_RECEIPT_PAYMENT'
          ELSE 'CASH_PAYMENT'
        END,
        'PAYMENT',
        p.id,
        p.created_at,
        p.voucher_date::text,
        p.document_number,
        p.status::text,
        p.total_amount::float,
        p.cash_account_id,
        p.reference_type::text,
        p.reason,
        COALESCE(
          NULLIF(btrim(p.payee_name), ''),
          NULLIF(btrim(p.partner_name_snapshot), ''),
          ''
        )
      FROM cash_payments p
      WHERE ${scope('p')}
    )
  `;
}

interface TotalsRow {
  total: number;
  totalAmount: number;
}

@QueryHandler(SearchCashVouchersV2Query)
export class SearchCashVouchersV2Handler
  implements IQueryHandler<SearchCashVouchersV2Query>
{
  constructor(
    @InjectRepository(CashReceiptEntity)
    private readonly repo: Repository<CashReceiptEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchCashVouchersV2Query): Promise<CashVoucherSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    // $1 = orgId. Branch and account scoping are applied inside both UNION halves
    // (unlike the v1 list endpoints, which skipped the branch filter whenever a
    // cashAccountId was supplied).
    const params: unknown[] = [actor.organizationId];
    let branchIdx: number | undefined;
    let accountIdx: number | undefined;

    if (actor.branchId) {
      params.push(actor.branchId);
      branchIdx = params.length;
    }
    if (dto.cashAccountId) {
      params.push(dto.cashAccountId);
      accountIdx = params.length;
    }

    const cte = buildCte(1, branchIdx, accountIdx);

    const where: string[] = [];
    this.applyDateRange(where, params, '"createdAt"::date', dto.createdAt);
    this.applyString(where, params, '"documentNumber"', dto.documentNumber);
    this.applyEnum(where, params, '"documentKind"', dto.documentKind?.value);
    this.applyEnum(where, params, 'status', dto.status?.value);
    this.applyCompare(where, params, '"totalAmount"', dto.totalAmount);
    this.applyString(where, params, 'counterparty', dto.counterparty);
    this.applyString(where, params, 'reason', dto.reason);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const dataSql = `
      ${cte}
      SELECT "documentKind", kind, id, "createdAt", "voucherDate", "documentNumber",
             status, "totalAmount", "cashAccountId", "referenceType", counterparty, reason
      FROM combined
      ${whereSql}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    // COUNT and SUM in one scalar pass (no GROUP BY). The sum must span every
    // matching row, not just this page, so it cannot be computed in memory.
    const totalsSql = `
      ${cte}
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM("totalAmount"), 0)::float AS "totalAmount"
      FROM combined
      ${whereSql}
    `;

    const [data, totals] = await Promise.all([
      this.repo.manager.query<CashVoucherRowDto[]>(dataSql, [
        ...params,
        limit,
        offset,
      ]),
      this.repo.manager.query<TotalsRow[]>(totalsSql, params),
    ]);

    return {
      data,
      total: totals[0]?.total ?? 0,
      page,
      limit,
      totalAmount: totals[0]?.totalAmount ?? 0,
    };
  }

  /**
   * String filter on a (possibly null) text column. Wildcards in the user value
   * are escaped so they match literally.
   */
  private applyString(
    where: string[],
    params: unknown[],
    col: string,
    filter?: StringFilterDto,
  ): void {
    const value = filter?.value?.trim();
    if (!value) return;
    const target = `COALESCE(${col}, '')`;
    const esc = value.replace(/[\\%_]/g, (c) => `\\${c}`);

    switch (filter!.operator) {
      case StringOperator.CONTAINS:
        params.push(`%${esc}%`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.EQUALS:
        params.push(value);
        where.push(`lower(${target}) = lower($${params.length})`);
        break;
      case StringOperator.STARTS_WITH:
        params.push(`${esc}%`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.ENDS_WITH:
        params.push(`%${esc}`);
        where.push(`${target} ILIKE $${params.length}`);
        break;
      case StringOperator.NOT_CONTAINS:
        params.push(`%${esc}%`);
        where.push(`${target} NOT ILIKE $${params.length}`);
        break;
    }
  }

  /** Numeric comparison on a money column. */
  private applyCompare(
    where: string[],
    params: unknown[],
    col: string,
    filter?: CompareFilterDto,
  ): void {
    if (!filter || filter.value === undefined || filter.value === null || filter.value === '') {
      return;
    }
    const num = Number(filter.value);
    if (!Number.isFinite(num)) return;

    const op = COMPARE_SQL[filter.operator];
    if (!op) return;
    params.push(num);
    where.push(`${col} ${op} $${params.length}`);
  }

  /**
   * Inclusive date range. `to` covers the whole day, matching
   * FilterBuilder.applyDateRange.
   */
  private applyDateRange(
    where: string[],
    params: unknown[],
    col: string,
    filter?: DateRangeFilterDto,
  ): void {
    if (!filter) return;
    if (filter.from) {
      params.push(filter.from);
      where.push(`${col} >= $${params.length}::date`);
    }
    if (filter.to) {
      params.push(filter.to);
      where.push(`${col} <= $${params.length}::date`);
    }
  }

  private applyEnum(
    where: string[],
    params: unknown[],
    col: string,
    value?: string | null,
  ): void {
    if (!value) return;
    params.push(value);
    where.push(`${col} = $${params.length}`);
  }
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};

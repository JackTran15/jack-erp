import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { CashMovementEntity, CashMovementType } from '../../cash/cash-movement.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { QueryCashLedgerDto } from './dto/query-cash-ledger.dto';
import { CashLedgerSearchV2Dto } from './dto/cash-ledger-search-v2.dto';

const DEFAULT_PAGE_SIZE = 50;
// Row order must be identical everywhere so the running balance is deterministic.
// Ascending is load-bearing: the balance accumulates forward through the period.
const ROW_ORDER = 'ORDER BY created_at ASC, id ASC';

export interface CashLedgerRow {
  movementId: string;
  date: Date;
  type: CashMovementType;
  voucherId: string | null;
  /** Null when the movement has no voucher; the label is a display concern. */
  voucherNumber: string | null;
  kind: 'PT' | 'PC' | 'Khác';
  description: string | null;
  partnerName: string | null;
  staffName: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface CashLedgerResult {
  openingBalance: number;
  pageOpeningBalance: number;
  rows: CashLedgerRow[];
  pageClosingBalance: number;
  total: number;
  page: number;
  pageSize: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

interface RawRow {
  id: string;
  cash_account_id: string;
  to_account_id: string | null;
  type: string;
  amount: string;
  created_at: Date;
  signed: string;
  receipt_id: string | null;
  payment_id: string | null;
  voucher_number: string | null;
  description: string | null;
  counterparty: string | null;
  staff: string | null;
}

/**
 * Every filter the ledger row stream understands. The same instance must reach
 * countInRange, sumInOut, sumSignedBeforeOffset and fetchPageRows or the grid
 * and its totals disagree.
 *
 * The date bounds are the exception: the opening and closing balances are the
 * fund's true balances around the period and are deliberately NOT narrowed by
 * column filters, so with filters active `opening + debit - credit` no longer
 * equals the fund's real closing balance.
 */
export interface LedgerFilters {
  dateFromInclusive?: string;
  dateToInclusive?: string;
  dateToExclusive?: string;
  documentNumber?: StringFilterDto;
  description?: StringFilterDto;
  counterparty?: StringFilterDto;
  staff?: StringFilterDto;
  amountIn?: CompareFilterDto;
  amountOut?: CompareFilterDto;
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};

/**
 * Voucher and staff resolution. LEFT JOIN LATERAL ... LIMIT 1 rather than a plain
 * join: cash_movement_id is 1:1 by contract, but a plain join would silently
 * multiply ledger rows — and corrupt the running balance — if that ever broke.
 * Soft-deleted vouchers are excluded, matching the repository `find` this
 * replaced.
 *
 * Payments are coalesced ahead of receipts because the previous in-memory
 * resolution built the receipt map first and let the payment map overwrite it.
 */
const VOUCHER_JOINS = `
      LEFT JOIN LATERAL (
        SELECT r.id, r.document_number, r.reason, r.payer_name,
               r.partner_name_snapshot, r.staff_id
        FROM cash_receipts r
        WHERE r.cash_movement_id = m.id AND r.deleted_at IS NULL
        LIMIT 1
      ) cr ON true
      LEFT JOIN LATERAL (
        SELECT p.id, p.document_number, p.reason, p.payee_name,
               p.partner_name_snapshot, p.staff_id
        FROM cash_payments p
        WHERE p.cash_movement_id = m.id AND p.deleted_at IS NULL
        LIMIT 1
      ) cp ON true
      LEFT JOIN users su
        ON su.id = COALESCE(cp.staff_id, cr.staff_id)
       AND su.organization_id::text = m.organization_id`;

/** Columns derived from the joins above. */
const DERIVED_COLUMNS = `
        cr.id                                            AS receipt_id,
        cp.id                                            AS payment_id,
        COALESCE(cp.document_number, cr.document_number) AS voucher_number,
        COALESCE(cp.reason, cr.reason, m.notes)          AS description,
        COALESCE(
          cp.partner_name_snapshot,
          cp.payee_name,
          cr.partner_name_snapshot,
          cr.payer_name
        )                                                AS counterparty,
        btrim(COALESCE(su.first_name, '') || ' ' || COALESCE(su.last_name, '')) AS staff`;

/**
 * Sổ chi tiết tiền mặt (cash detail ledger). Scalar `SUM`/`COUNT` (no GROUP BY /
 * window function) for opening/closing/totals; running balance is computed in RAM
 * per page. Offset pagination: the page opening balance is the global opening plus
 * the signed sum of the in-range rows that precede the page. Filters on
 * `(cash_account_id = X OR to_account_id = X)` so internal transfers appear in both
 * the source and destination accounts' ledgers.
 *
 * `cash_movements` has no document date, so `created_at` is the ledger's date —
 * it drives both the period bounds and the row order.
 *
 * Voucher, counterparty and staff are resolved in SQL (see VOUCHER_JOINS) rather
 * than by a post-query map, which is what makes them filterable at all: a filter
 * applied after the page query would narrow the page instead of the row set.
 */
@Injectable()
export class CashLedgerService {
  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly movementRepo: Repository<CashMovementEntity>,
    @InjectRepository(CashAccountEntity)
    private readonly accountRepo: Repository<CashAccountEntity>,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  /** Signed amount of a movement from cash account `$1`'s perspective. */
  private signedCase(): string {
    return `CASE
      WHEN m.type = 'DEPOSIT' THEN m.amount
      WHEN m.type = 'ADJUSTMENT' THEN m.amount
      WHEN m.type = 'WITHDRAWAL' THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.cash_account_id = $1 THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.to_account_id = $1 THEN m.amount
      ELSE 0
    END`;
  }

  /**
   * The scoped row set as a SQL text fragment (no outer SELECT/ORDER/LIMIT —
   * callers wrap it). `$1` = cash account id, `$2` = organization id; further
   * bounds and filter params are appended positionally.
   */
  private buildRowsSql(
    accountId: string,
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [accountId, org];
    // Movement-level predicates stay on the base table so they can use the
    // cash_movements indexes.
    const where: string[] = [
      'm.organization_id = $2',
      '(m.cash_account_id = $1 OR m.to_account_id = $1)',
    ];

    if (branchId) {
      params.push(branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    if (filters.dateFromInclusive) {
      params.push(filters.dateFromInclusive);
      where.push(`m.created_at >= $${params.length}::date`);
    }
    if (filters.dateToInclusive) {
      params.push(filters.dateToInclusive);
      where.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (filters.dateToExclusive) {
      params.push(filters.dateToExclusive);
      where.push(`m.created_at < $${params.length}::date`);
    }

    const base = `SELECT m.id, m.cash_account_id, m.to_account_id, m.type, m.amount,
        m.created_at, ${this.signedCase()} AS signed,${DERIVED_COLUMNS}
      FROM cash_movements m${VOUCHER_JOINS}
      WHERE ${where.join(' AND ')}`;

    // Filters on derived columns run outside the base query — they reference the
    // aliased output, and wrapping here means every caller (page rows, count,
    // debit/credit sums, sum-before-offset) sees exactly the same row stream.
    const outer: string[] = [];
    this.applyString(outer, params, 'voucher_number', filters.documentNumber);
    this.applyString(outer, params, 'description', filters.description);
    this.applyString(outer, params, 'counterparty', filters.counterparty);
    this.applyString(outer, params, 'staff', filters.staff);
    // amountIn/amountOut are the two signs of `signed`, so each filter also
    // constrains the direction.
    this.applyCompare(outer, params, 'signed', filters.amountIn, 'in');
    this.applyCompare(outer, params, 'signed', filters.amountOut, 'out');

    const sql = outer.length
      ? `SELECT * FROM (${base}) filtered WHERE ${outer.join(' AND ')}`
      : base;
    return { sql, params };
  }

  /**
   * String filter on a (possibly null) derived column. Wildcards in the user
   * value are escaped so they match literally.
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

  /**
   * Money comparison against one direction of `signed`. `direction` picks the
   * sign: 'in' compares `signed` itself, 'out' compares its absolute value.
   */
  private applyCompare(
    where: string[],
    params: unknown[],
    col: string,
    filter: CompareFilterDto | undefined,
    direction: 'in' | 'out',
  ): void {
    if (!filter || filter.value === undefined || filter.value === null || filter.value === '') {
      return;
    }
    const num = Number(filter.value);
    if (!Number.isFinite(num)) return;

    const op = COMPARE_SQL[filter.operator];
    if (!op) return;
    params.push(num);
    where.push(
      direction === 'in'
        ? `(${col} > 0 AND ${col} ${op} $${params.length})`
        : `(${col} < 0 AND (-${col}) ${op} $${params.length})`,
    );
  }

  /**
   * v1 adapter. Maps the query-string DTO onto the same implementation as the v2
   * search so the two can never drift. Branch handling is unchanged from the
   * original endpoint: it narrows only when the caller passes `branchId`.
   */
  async getLedger(
    query: QueryCashLedgerDto,
    actor: ActorContext,
  ): Promise<CashLedgerResult> {
    return this.run(
      {
        page: query.page,
        limit: query.pageSize,
        cashAccountId: query.cashAccountId,
        createdAt: { from: query.dateFrom, to: query.dateTo },
      },
      actor,
      query.branchId,
    );
  }

  /**
   * v2 entry point.
   *
   * The row set is already pinned to one cash fund, so no `branch_id` predicate is
   * added — that would drop the destination side of an inter-branch transfer,
   * whose movement row carries the *source* branch. Instead the requested account
   * is verified to belong to the actor's branch, which is what actually prevents
   * reading another branch's fund (mirrors DepositLedgerService.resolveScope).
   */
  async search(
    dto: CashLedgerSearchV2Dto,
    actor: ActorContext,
  ): Promise<CashLedgerResult> {
    if (dto.cashAccountId) {
      const account = await this.accountRepo.findOne({
        where: {
          id: dto.cashAccountId,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
      });
      if (!account) {
        throw new NotFoundException(
          `Cash account ${dto.cashAccountId} not found for this branch`,
        );
      }
    }
    return this.run(dto, actor, undefined);
  }

  private async run(
    dto: CashLedgerSearchV2Dto,
    actor: ActorContext,
    branchIdOverride: string | undefined,
  ): Promise<CashLedgerResult> {
    const page = dto.page ?? 1;
    const pageSize = dto.limit ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const org = actor.organizationId;
    const branchId = branchIdOverride;
    // One cash fund per branch: default to the branch fund when no account given.
    const accountId =
      dto.cashAccountId ??
      (await this.cashFundResolver.resolveBranchCashFund(
        org,
        branchId ?? actor.branchId,
      ));

    const dateFrom = dto.createdAt?.from;
    const dateTo = dto.createdAt?.to;
    const filters: LedgerFilters = {
      dateFromInclusive: dateFrom,
      dateToInclusive: dateTo,
      documentNumber: dto.documentNumber,
      description: dto.description,
      counterparty: dto.counterparty,
      staff: dto.staff,
      amountIn: dto.amountIn,
      amountOut: dto.amountOut,
    };

    // --- scalar SUMs / COUNT (no GROUP BY) --------------------------------
    // Opening and closing are the fund's real balances around the period, so they
    // take the date bounds only — never the column filters (see LedgerFilters).
    const openingBalance = await this.sumSigned(accountId, org, branchId, {
      dateToExclusive: dateFrom, // movements strictly before the range
    });

    const closingBalance = await this.sumSigned(accountId, org, branchId, {
      dateToInclusive: dateTo, // everything up to and including dateTo
    });

    const { totalDebit, totalCredit } = await this.sumDebitCredit(
      accountId,
      org,
      branchId,
      filters,
    );

    const total = await this.countInRange(accountId, org, branchId, filters);

    // Δ of in-range rows that precede the current page (the first `offset` rows).
    const pageDelta =
      offset > 0
        ? await this.sumSignedBeforeOffset(
            accountId,
            org,
            branchId,
            filters,
            offset,
          )
        : 0;
    const pageOpeningBalance = openingBalance + pageDelta;

    // --- page rows ---------------------------------------------------------
    const pageRows = await this.fetchPageRows(
      accountId,
      org,
      branchId,
      filters,
      pageSize,
      offset,
    );

    let running = pageOpeningBalance;
    const rows: CashLedgerRow[] = pageRows.map((r) => {
      const signed = Number(r.signed);
      const debit = signed > 0 ? signed : 0;
      const credit = signed < 0 ? -signed : 0;
      running += signed;
      return {
        movementId: r.id,
        date: r.created_at,
        type: r.type as CashMovementType,
        voucherId: r.payment_id ?? r.receipt_id ?? null,
        voucherNumber: r.voucher_number ?? null,
        kind: r.payment_id ? 'PC' : r.receipt_id ? 'PT' : 'Khác',
        description: r.description ?? null,
        partnerName: r.counterparty ?? null,
        staffName: r.staff || null,
        debit,
        credit,
        balance: running,
      };
    });

    const pageClosingBalance = running;

    return {
      openingBalance,
      pageOpeningBalance,
      rows,
      pageClosingBalance,
      total,
      page,
      pageSize,
      closingBalance,
      totalDebit,
      totalCredit,
    };
  }

  // ---------------------------------------------------------------------------
  // SQL helpers (scalar aggregates)
  // ---------------------------------------------------------------------------

  private async sumSigned(
    accountId: string,
    org: string,
    branchId: string | undefined,
    bounds: Pick<
      LedgerFilters,
      'dateFromInclusive' | 'dateToInclusive' | 'dateToExclusive'
    >,
  ): Promise<number> {
    const { sql, params } = this.buildRowsSql(accountId, org, branchId, bounds);
    const rows = await this.movementRepo.query(
      `SELECT COALESCE(SUM(signed), 0) AS sum FROM (${sql}) legs`,
      params,
    );
    return Number(rows[0]?.sum ?? 0);
  }

  /**
   * Signed sum of the first `offset` in-range rows in ledger order. The inner
   * ORDER BY matches the page query's total order, so these are exactly the rows
   * displayed on the pages preceding the current one.
   */
  private async sumSignedBeforeOffset(
    accountId: string,
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
    offset: number,
  ): Promise<number> {
    const { sql, params } = this.buildRowsSql(accountId, org, branchId, filters);
    params.push(offset);
    const fullSql = `SELECT COALESCE(SUM(sub.s), 0) AS sum
      FROM (
        SELECT signed AS s FROM (${sql}) legs
        ${ROW_ORDER}
        LIMIT $${params.length}
      ) sub`;
    const rows = await this.movementRepo.query(fullSql, params);
    return Number(rows[0]?.sum ?? 0);
  }

  private async countInRange(
    accountId: string,
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): Promise<number> {
    const { sql, params } = this.buildRowsSql(accountId, org, branchId, filters);
    const rows = await this.movementRepo.query(
      `SELECT COUNT(*)::int AS total FROM (${sql}) legs`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async sumDebitCredit(
    accountId: string,
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): Promise<{ totalDebit: number; totalCredit: number }> {
    const { sql, params } = this.buildRowsSql(accountId, org, branchId, filters);
    const rows = await this.movementRepo.query(
      `SELECT
        COALESCE(SUM(CASE WHEN signed > 0 THEN signed ELSE 0 END), 0) AS debit,
        COALESCE(SUM(CASE WHEN signed < 0 THEN -signed ELSE 0 END), 0) AS credit
      FROM (${sql}) legs`,
      params,
    );
    return {
      totalDebit: Number(rows[0]?.debit ?? 0),
      totalCredit: Number(rows[0]?.credit ?? 0),
    };
  }

  private async fetchPageRows(
    accountId: string,
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
    pageSize: number,
    offset: number,
  ): Promise<RawRow[]> {
    const { sql, params } = this.buildRowsSql(accountId, org, branchId, filters);
    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const fullSql = `SELECT id, cash_account_id, to_account_id, type, amount, created_at,
        signed, receipt_id, payment_id, voucher_number, description, counterparty, staff
      FROM (${sql}) legs
      ${ROW_ORDER}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    return this.movementRepo.query(fullSql, params);
  }
}

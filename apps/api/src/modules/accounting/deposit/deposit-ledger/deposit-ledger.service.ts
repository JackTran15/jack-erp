import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  DepositAccountStatus,
  DepositLedgerResponse,
  DepositLedgerRow,
  DepositMovementSource,
  ReconStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { DepositAccountEntity } from '../deposit-account.entity';
import { DepositMovementEntity } from '../deposit-movement.entity';
import { DepositLedgerQueryDto } from './dto/deposit-ledger-query.dto';
import { DepositLedgerSearchV2Dto } from './dto/deposit-ledger-search-v2.dto';
import { DepositBalanceService, DepositBalances } from './deposit-balance.service';

const DEFAULT_PAGE_SIZE = 50;
// Row order must be identical everywhere so the running balance is deterministic (BR-LEDG-01).
// doc_date stays the primary key so the ledger remains date-progressive; created_at breaks
// same-day ties by entry order. `leg` breaks ties between the two rows a single internal
// transfer produces (BR-LEDG-04) so their relative order never flips between calls.
const ROW_ORDER =
  'ORDER BY doc_date ASC, created_at ASC, id ASC, leg ASC';

interface RawRow {
  id: string;
  ledger_account_id: string;
  type: string;
  amount: string;
  doc_date: string;
  document_number: string | null;
  recon_status: string;
  value_date: string | null;
  signed: string;
  source: string;
  receipt_id: string | null;
  payment_id: string | null;
  account_no: string;
  description: string | null;
  counterparty: string;
  staff: string;
}

interface LedgerScope {
  accountIds: string[];
  openingBalanceSum: number;
}

/**
 * Every filter the ledger row stream understands. The same instance must reach
 * countInRange, sumInOut, sumSignedBeforeOffset and fetchPageRows or the grid
 * and its totals disagree.
 *
 * `beforeDate` is the exception: the opening balance is the fund's true balance
 * entering the period and is deliberately NOT narrowed by column filters, so
 * with filters active `openingBalance + totalIn - totalOut` no longer equals the
 * fund's real closing balance. That was already true of the v1 `search` filter.
 */
export interface LedgerFilters {
  from?: string;
  to?: string;
  beforeDate?: string;
  documentNumber?: StringFilterDto;
  accountNo?: StringFilterDto;
  description?: StringFilterDto;
  counterparty?: StringFilterDto;
  staff?: StringFilterDto;
  amountIn?: CompareFilterDto;
  amountOut?: CompareFilterDto;
  reconStatus?: string | null;
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};

/**
 * Voucher and staff resolution, shared by both legs. LEFT JOIN LATERAL ... LIMIT 1
 * rather than a plain join: deposit_movement_id is 1:1 by contract, but a plain
 * join would silently multiply ledger rows — and corrupt the running balance —
 * if that ever broke. `collected_by` / `paid_by` hold user ids, so the staff name
 * needs the users join.
 */
const VOUCHER_JOINS = `
      LEFT JOIN LATERAL (
        SELECT r.id, r.reason, r.payer_name, r.partner_name_snapshot, r.collected_by
        FROM bank_receipts r
        WHERE r.deposit_movement_id = m.id AND r.deleted_at IS NULL
        LIMIT 1
      ) br ON true
      LEFT JOIN LATERAL (
        SELECT p.id, p.reason, p.payee_name, p.partner_name_snapshot, p.paid_by
        FROM bank_payments p
        WHERE p.deposit_movement_id = m.id AND p.deleted_at IS NULL
        LIMIT 1
      ) bp ON true
      LEFT JOIN users su
        ON su.id::text = COALESCE(br.collected_by, bp.paid_by)
       AND su.organization_id::text = m.organization_id`;

/** Columns derived from the joins above, identical in both legs. */
const DERIVED_COLUMNS = `
        br.id AS receipt_id,
        bp.id AS payment_id,
        COALESCE(a.account_no, '') AS account_no,
        COALESCE(br.reason, bp.reason) AS description,
        COALESCE(
          NULLIF(btrim(br.payer_name), ''),
          NULLIF(btrim(bp.payee_name), ''),
          NULLIF(btrim(br.partner_name_snapshot), ''),
          NULLIF(btrim(bp.partner_name_snapshot), ''),
          ''
        ) AS counterparty,
        btrim(COALESCE(su.first_name, '') || ' ' || COALESCE(su.last_name, '')) AS staff`;

/**
 * Sổ chi tiết tiền gửi (deposit detail ledger). Mirrors CashLedgerService: scalar
 * SUM/COUNT (no GROUP BY / window), running balance in RAM per page, offset pagination
 * with the page opening balance = global opening + signed sum of the rows before the page.
 * Two deposit specifics: opening balance adds the account's opening_balance (BR-LEDG-02),
 * and the range/order key is doc_date.
 *
 * BR-LEDG-03: `depositAccountId` is optional. Given, the ledger scopes to that one account
 * (unchanged historical behavior — status is not filtered, so a closed account's history is
 * still viewable). Omitted, the scope is every ACTIVE deposit account of the actor's branch —
 * the branch is treated as one bucket (BR-LEDG-04): opening balance sums every scoped
 * account's `opening_balance`, and a single running total covers all of them.
 *
 * A `deposit_movements` row of type TRANSFER carries two accounts (`deposit_account_id` =
 * source, `to_account_id` = destination). Every scoped query splits it into up to two "legs" —
 * one row per scoped account it touches — via `UNION ALL` in SQL rather than post-processing in
 * JS, because pagination (LIMIT/OFFSET) must run over the already-split row stream to stay
 * correct. A transfer between two accounts that are both in scope therefore renders as two
 * ledger rows (−amount on the source, +amount on the destination) and nets to zero across
 * `totalIn`/`totalOut`/running balance, matching the reversible nature of an internal transfer.
 * A transfer where only one side is in scope (e.g. an inter-branch transfer) renders as a single
 * row for whichever side is in scope. In the single-account case this degenerates to exactly the
 * previous `(deposit_account_id = X OR to_account_id = X)` behavior — the two legs are mutually
 * exclusive for one account, so one leg always contributes zero rows.
 */
@Injectable()
export class DepositLedgerService {
  constructor(
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly accountRepo: Repository<DepositAccountEntity>,
    private readonly balanceService: DepositBalanceService,
  ) {}

  /**
   * Resolve which accounts the ledger covers. `$1` in every downstream query is this
   * scope's account-id array, matched via `= ANY($1)`.
   */
  private async resolveScope(
    depositAccountId: string | undefined,
    actor: ActorContext,
  ): Promise<LedgerScope> {
    const org = actor.organizationId;
    const branch = actor.branchId;

    if (depositAccountId) {
      const account = await this.accountRepo.findOne({
        where: { id: depositAccountId, organizationId: org, branchId: branch },
      });
      if (!account) {
        throw new NotFoundException(
          `Deposit account ${depositAccountId} not found for this branch`,
        );
      }
      return {
        accountIds: [account.id],
        openingBalanceSum: Number(account.openingBalance),
      };
    }

    const accounts = await this.accountRepo.find({
      where: { organizationId: org, branchId: branch, status: DepositAccountStatus.ACTIVE },
    });
    return {
      accountIds: accounts.map((a) => a.id),
      openingBalanceSum: accounts.reduce((sum, a) => sum + Number(a.openingBalance), 0),
    };
  }

  /**
   * The scoped, leg-split row set as a SQL text fragment (no outer SELECT/ORDER/LIMIT — callers
   * wrap it). `$1` = account-id array, `$2` = organization id; further bounds params are appended
   * and reused positionally across both UNION ALL halves.
   */
  private buildLegsSql(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [accountIds, org];
    // Movement-level predicates stay inside each half so they can use the
    // deposit_movements indexes.
    const common: string[] = ['m.organization_id = $2'];
    if (branchId) {
      params.push(branchId);
      common.push(`m.branch_id = $${params.length}`);
    }
    if (filters.beforeDate) {
      params.push(filters.beforeDate);
      common.push(`m.doc_date < $${params.length}::date`);
    }
    if (filters.from) {
      params.push(filters.from);
      common.push(`m.doc_date >= $${params.length}::date`);
    }
    if (filters.to) {
      params.push(filters.to);
      common.push(`m.doc_date <= $${params.length}::date`);
    }
    const commonWhere = common.join(' AND ');

    const leg = (
      accountCol: string,
      legNo: number,
      signedExpr: string,
      legWhere: string,
    ): string => `SELECT m.id, ${accountCol} AS ledger_account_id, m.type, m.amount,
        m.doc_date, m.document_number, m.recon_status, m.value_date, m.created_at,
        m.source,
        ${legNo} AS leg, ${signedExpr} AS signed,${DERIVED_COLUMNS}
      FROM deposit_movements m
      LEFT JOIN deposit_accounts a
        ON a.id = ${accountCol} AND a.organization_id = $2${VOUCHER_JOINS}
      WHERE ${legWhere} AND ${commonWhere}`;

    const union = `${leg(
      'm.deposit_account_id',
      0,
      `(CASE
          WHEN m.type = 'DEPOSIT' THEN m.amount
          WHEN m.type = 'ADJUSTMENT' THEN m.amount
          WHEN m.type = 'WITHDRAWAL' THEN -m.amount
          WHEN m.type = 'TRANSFER' THEN -m.amount
          ELSE 0
        END)`,
      'm.deposit_account_id = ANY($1)',
    )}

      UNION ALL

      ${leg(
        'm.to_account_id',
        1,
        'm.amount',
        `m.type = 'TRANSFER' AND m.to_account_id = ANY($1)`,
      )}`;

    // Filters on derived columns run outside the union — they reference the
    // aliased output, and wrapping here means every caller (page rows, count,
    // in/out sums, sum-before-offset) sees exactly the same row stream.
    const outer: string[] = [];
    this.applyString(outer, params, 'document_number', filters.documentNumber);
    this.applyString(outer, params, 'account_no', filters.accountNo);
    this.applyString(outer, params, 'description', filters.description);
    this.applyString(outer, params, 'counterparty', filters.counterparty);
    this.applyString(outer, params, 'staff', filters.staff);
    // amountIn/amountOut are the two signs of `signed`, so each filter also
    // constrains the direction.
    this.applyCompare(outer, params, 'signed', filters.amountIn, 'in');
    this.applyCompare(outer, params, 'signed', filters.amountOut, 'out');
    if (filters.reconStatus) {
      params.push(filters.reconStatus);
      outer.push(`recon_status = $${params.length}`);
    }

    const sql = outer.length
      ? `SELECT * FROM (${union}) filtered WHERE ${outer.join(' AND ')}`
      : union;
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
   * search so the two can never drift; the Excel export also goes through here.
   */
  async getLedger(
    query: DepositLedgerQueryDto,
    actor: ActorContext,
  ): Promise<DepositLedgerResponse> {
    return this.search(
      {
        page: query.page,
        limit: query.pageSize,
        depositAccountId: query.depositAccountId,
        docDate: { from: query.dateFrom, to: query.dateTo },
        documentNumber: query.search
          ? { operator: StringOperator.CONTAINS, value: query.search }
          : undefined,
      },
      actor,
    );
  }

  async search(
    dto: DepositLedgerSearchV2Dto,
    actor: ActorContext,
  ): Promise<DepositLedgerResponse> {
    const page = dto.page ?? 1;
    const pageSize = dto.limit ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const org = actor.organizationId;
    const branch = actor.branchId;

    const filters: LedgerFilters = {
      from: dto.docDate?.from,
      to: dto.docDate?.to,
      documentNumber: dto.documentNumber,
      accountNo: dto.accountNo,
      description: dto.description,
      counterparty: dto.counterparty,
      staff: dto.staff,
      amountIn: dto.amountIn,
      amountOut: dto.amountOut,
      reconStatus: dto.reconStatus?.value,
    };

    const { accountIds, openingBalanceSum } = await this.resolveScope(
      dto.depositAccountId,
      actor,
    );

    if (accountIds.length === 0) {
      return {
        openingBalance: '0',
        rows: [],
        totalIn: '0',
        totalOut: '0',
        closingBalance: '0',
        page,
        pageSize,
        total: 0,
        bookBalance: '0',
        availableBalance: '0',
        pendingClearingAmount: '0',
      };
    }

    // The opening balance is the fund's balance entering the period, so it takes
    // the date cutoff only — never the column filters (see LedgerFilters).
    const openingSigned = await this.sumSigned(accountIds, org, branch, {
      beforeDate: filters.from,
    });
    const openingBalance = openingBalanceSum + openingSigned;

    const { totalIn, totalOut } = await this.sumInOut(accountIds, org, branch, filters);
    const total = await this.countInRange(accountIds, org, branch, filters);

    const pageDelta =
      offset > 0
        ? await this.sumSignedBeforeOffset(accountIds, org, branch, filters, offset)
        : 0;
    let running = openingBalance + pageDelta;

    const raw = await this.fetchPageRows(accountIds, org, branch, filters, pageSize, offset);
    const signedRows = raw.map((r) => {
      const signed = Number(r.signed);
      const amountIn = signed > 0 ? signed : 0;
      const amountOut = signed < 0 ? -signed : 0;
      running += signed;
      return { r, amountIn, amountOut, running };
    });

    const rows: DepositLedgerRow[] = signedRows.map(
      ({ r, amountIn, amountOut, running: runningAt }) => ({
        id: r.id,
        docDate: r.doc_date,
        documentNumber: r.document_number,
        receiptNo: amountIn > 0 ? r.document_number : null,
        paymentNo: amountOut > 0 ? r.document_number : null,
        receiptId: r.receipt_id ?? null,
        paymentId: r.payment_id ?? null,
        depositAccountNo: r.account_no ?? '',
        description: r.description ?? null,
        amountIn: String(amountIn),
        amountOut: String(amountOut),
        runningBalance: String(runningAt),
        counterpartyName: r.counterparty || null,
        staffName: r.staff || null,
        reconStatus: r.recon_status as ReconStatus,
        valueDate: r.value_date,
        // Lets the grid route a click: POS_INVOICE rows have no voucher, so the
        // document number is the invoice code rather than a phiếu thu/chi.
        source: r.source as DepositMovementSource,
        isCleared: !r.value_date || r.value_date <= this.today(),
      }),
    );

    const { bookBalance, availableBalance, pendingClearingAmount } =
      await this.getScopedBalances(accountIds, actor);

    return {
      openingBalance: String(openingBalance),
      rows,
      totalIn: String(totalIn),
      totalOut: String(totalOut),
      closingBalance: String(openingBalance + totalIn - totalOut),
      page,
      pageSize,
      total,
      bookBalance: String(bookBalance),
      availableBalance: String(availableBalance),
      pendingClearingAmount: String(pendingClearingAmount),
    };
  }

  /**
   * Sum of each scoped account's own (already-correct, per-account) book/available balance.
   * An internal transfer contributes −amount to the source's balance and +amount to the
   * destination's, so summing across a multi-account scope nets it to zero automatically —
   * no separate multi-account formula needed.
   */
  private async getScopedBalances(
    accountIds: string[],
    actor: ActorContext,
  ): Promise<DepositBalances> {
    const perAccount = await Promise.all(
      accountIds.map((id) => this.balanceService.getBalances(id, actor)),
    );
    return perAccount.reduce(
      (acc, b) => ({
        bookBalance: acc.bookBalance + b.bookBalance,
        availableBalance: acc.availableBalance + b.availableBalance,
        pendingClearingAmount: acc.pendingClearingAmount + b.pendingClearingAmount,
      }),
      { bookBalance: 0, availableBalance: 0, pendingClearingAmount: 0 },
    );
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async exportExcel(
    query: DepositLedgerQueryDto,
    actor: ActorContext,
  ): Promise<Buffer> {
    // Export the whole range (no paging) preserving opening + running balance.
    const full = await this.getLedger(
      { ...query, page: 1, pageSize: 500 },
      actor,
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sổ chi tiết tiền gửi');
    sheet.columns = [
      { header: 'Ngày chứng từ', key: 'docDate', width: 14 },
      { header: 'Số chứng từ', key: 'documentNumber', width: 18 },
      { header: 'Diễn giải', key: 'description', width: 30 },
      { header: 'Thu', key: 'amountIn', width: 16 },
      { header: 'Chi', key: 'amountOut', width: 16 },
      { header: 'Số dư còn lại', key: 'runningBalance', width: 18 },
    ];
    sheet.addRow({ description: 'Số dư đầu kỳ', runningBalance: full.openingBalance });
    for (const r of full.rows) {
      sheet.addRow({
        docDate: r.docDate,
        documentNumber: r.documentNumber,
        description: r.description,
        amountIn: r.amountIn,
        amountOut: r.amountOut,
        runningBalance: r.runningBalance,
      });
    }
    sheet.addRow({
      description: 'Tổng',
      amountIn: full.totalIn,
      amountOut: full.totalOut,
      runningBalance: full.closingBalance,
    });
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  private async sumSigned(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    bounds: { beforeDate?: string },
  ): Promise<number> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, bounds);
    const rows = await this.movementRepo.query(
      `SELECT COALESCE(SUM(signed), 0) AS sum FROM (${sql}) legs`,
      params,
    );
    return Number(rows[0]?.sum ?? 0);
  }

  private async sumSignedBeforeOffset(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
    offset: number,
  ): Promise<number> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, filters);
    params.push(offset);
    const fullSql = `SELECT COALESCE(SUM(sub.s), 0) AS sum FROM (
        SELECT signed AS s FROM (${sql}) legs
        ${ROW_ORDER}
        LIMIT $${params.length}
      ) sub`;
    const rows = await this.movementRepo.query(fullSql, params);
    return Number(rows[0]?.sum ?? 0);
  }

  private async countInRange(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): Promise<number> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, filters);
    const rows = await this.movementRepo.query(
      `SELECT COUNT(*)::int AS total FROM (${sql}) legs`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async sumInOut(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
  ): Promise<{ totalIn: number; totalOut: number }> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, filters);
    const rows = await this.movementRepo.query(
      `SELECT
        COALESCE(SUM(CASE WHEN signed > 0 THEN signed ELSE 0 END), 0) AS "in",
        COALESCE(SUM(CASE WHEN signed < 0 THEN -signed ELSE 0 END), 0) AS "out"
      FROM (${sql}) legs`,
      params,
    );
    return {
      totalIn: Number(rows[0]?.in ?? 0),
      totalOut: Number(rows[0]?.out ?? 0),
    };
  }

  private async fetchPageRows(
    accountIds: string[],
    org: string,
    branchId: string | undefined,
    filters: LedgerFilters,
    pageSize: number,
    offset: number,
  ): Promise<RawRow[]> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, filters);
    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const fullSql = `SELECT id, ledger_account_id, type, amount, doc_date, document_number,
        recon_status, value_date, signed, source, receipt_id, payment_id, account_no,
        description, counterparty, staff
      FROM (${sql}) legs
      ${ROW_ORDER}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    return this.movementRepo.query(fullSql, params);
  }
}

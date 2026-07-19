import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  DepositAccountStatus,
  DepositLedgerResponse,
  DepositLedgerRow,
  ReconStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../deposit-account.entity';
import { DepositMovementEntity } from '../deposit-movement.entity';
import { BankReceiptEntity } from '../../deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankPaymentEntity } from '../../deposit-vouchers/bank-payments/bank-payment.entity';
import { DepositLedgerQueryDto } from './dto/deposit-ledger-query.dto';
import { DepositBalanceService, DepositBalances } from './deposit-balance.service';

const DEFAULT_PAGE_SIZE = 50;
// Row order must be identical everywhere so the running balance is deterministic (BR-LEDG-01).
// `leg` breaks ties between the two rows a single internal transfer produces (BR-LEDG-04) so
// their relative order never flips between calls.
const ROW_ORDER =
  'ORDER BY doc_date ASC, document_number ASC NULLS LAST, id ASC, leg ASC';

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
}

interface LedgerScope {
  accountIds: string[];
  accountById: Map<string, DepositAccountEntity>;
  openingBalanceSum: number;
}

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
    @InjectRepository(BankReceiptEntity)
    private readonly bankReceiptRepo: Repository<BankReceiptEntity>,
    @InjectRepository(BankPaymentEntity)
    private readonly bankPaymentRepo: Repository<BankPaymentEntity>,
    private readonly balanceService: DepositBalanceService,
  ) {}

  /**
   * Resolve which accounts the ledger covers. `$1` in every downstream query is this
   * scope's account-id array, matched via `= ANY($1)`.
   */
  private async resolveScope(
    query: DepositLedgerQueryDto,
    actor: ActorContext,
  ): Promise<LedgerScope> {
    const org = actor.organizationId;
    const branch = actor.branchId;

    if (query.depositAccountId) {
      const account = await this.accountRepo.findOne({
        where: { id: query.depositAccountId, organizationId: org, branchId: branch },
      });
      if (!account) {
        throw new NotFoundException(
          `Deposit account ${query.depositAccountId} not found for this branch`,
        );
      }
      return {
        accountIds: [account.id],
        accountById: new Map([[account.id, account]]),
        openingBalanceSum: Number(account.openingBalance),
      };
    }

    const accounts = await this.accountRepo.find({
      where: { organizationId: org, branchId: branch, status: DepositAccountStatus.ACTIVE },
    });
    return {
      accountIds: accounts.map((a) => a.id),
      accountById: new Map(accounts.map((a) => [a.id, a])),
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
    bounds: { from?: string; to?: string; beforeDate?: string; search?: string },
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [accountIds, org];
    const common: string[] = ['m.organization_id = $2'];
    if (branchId) {
      params.push(branchId);
      common.push(`m.branch_id = $${params.length}`);
    }
    if (bounds.beforeDate) {
      params.push(bounds.beforeDate);
      common.push(`m.doc_date < $${params.length}::date`);
    }
    if (bounds.from) {
      params.push(bounds.from);
      common.push(`m.doc_date >= $${params.length}::date`);
    }
    if (bounds.to) {
      params.push(bounds.to);
      common.push(`m.doc_date <= $${params.length}::date`);
    }
    if (bounds.search) {
      params.push(`%${bounds.search}%`);
      common.push(`m.document_number ILIKE $${params.length}`);
    }
    const commonWhere = common.join(' AND ');

    const sql = `SELECT m.id, m.deposit_account_id AS ledger_account_id, m.type, m.amount,
        m.doc_date, m.document_number, m.recon_status, m.value_date, 0 AS leg,
        (CASE
          WHEN m.type = 'DEPOSIT' THEN m.amount
          WHEN m.type = 'ADJUSTMENT' THEN m.amount
          WHEN m.type = 'WITHDRAWAL' THEN -m.amount
          WHEN m.type = 'TRANSFER' THEN -m.amount
          ELSE 0
        END) AS signed
      FROM deposit_movements m
      WHERE m.deposit_account_id = ANY($1) AND ${commonWhere}

      UNION ALL

      SELECT m.id, m.to_account_id AS ledger_account_id, m.type, m.amount,
        m.doc_date, m.document_number, m.recon_status, m.value_date, 1 AS leg,
        m.amount AS signed
      FROM deposit_movements m
      WHERE m.type = 'TRANSFER' AND m.to_account_id = ANY($1) AND ${commonWhere}`;
    return { sql, params };
  }

  async getLedger(
    query: DepositLedgerQueryDto,
    actor: ActorContext,
  ): Promise<DepositLedgerResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const org = actor.organizationId;
    const branch = actor.branchId;

    const { accountIds, accountById, openingBalanceSum } = await this.resolveScope(
      query,
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

    const openingSigned = await this.sumSigned(accountIds, org, branch, {
      beforeDate: query.dateFrom,
    });
    const openingBalance = openingBalanceSum + openingSigned;

    const { totalIn, totalOut } = await this.sumInOut(accountIds, org, branch, query);
    const total = await this.countInRange(accountIds, org, branch, query);

    const pageDelta =
      offset > 0
        ? await this.sumSignedBeforeOffset(accountIds, org, branch, query, offset)
        : 0;
    let running = openingBalance + pageDelta;

    const raw = await this.fetchPageRows(accountIds, org, branch, query, pageSize, offset);
    const signedRows = raw.map((r) => {
      const signed = Number(r.signed);
      const amountIn = signed > 0 ? signed : 0;
      const amountOut = signed < 0 ? -signed : 0;
      running += signed;
      return { r, amountIn, amountOut, running };
    });
    const { receiptIdByMovement, paymentIdByMovement } = await this.voucherIdMaps(
      signedRows.filter((s) => s.amountIn > 0).map((s) => s.r.id),
      signedRows.filter((s) => s.amountOut > 0).map((s) => s.r.id),
    );

    const rows: DepositLedgerRow[] = signedRows.map(({ r, amountIn, amountOut, running: runningAt }) => {
      const account = accountById.get(r.ledger_account_id);
      return {
        id: r.id,
        docDate: r.doc_date,
        documentNumber: r.document_number,
        receiptNo: amountIn > 0 ? r.document_number : null,
        paymentNo: amountOut > 0 ? r.document_number : null,
        receiptId: receiptIdByMovement.get(r.id) ?? null,
        paymentId: paymentIdByMovement.get(r.id) ?? null,
        depositAccountNo: account?.accountNo ?? '',
        description: null,
        amountIn: String(amountIn),
        amountOut: String(amountOut),
        runningBalance: String(runningAt),
        counterpartyName: null,
        staffName: null,
        reconStatus: r.recon_status as ReconStatus,
        valueDate: r.value_date,
        isCleared: !r.value_date || r.value_date <= this.today(),
      };
    });

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

  /**
   * `bank_receipts`/`bank_payments` each carry a `deposit_movement_id` back-reference to the
   * movement row they posted (1:1 — set once, at creation). Batched by movement id per page
   * (never per row) so the FE can jump straight to that voucher's detail dialog.
   */
  private async voucherIdMaps(
    receiptMovementIds: string[],
    paymentMovementIds: string[],
  ): Promise<{ receiptIdByMovement: Map<string, string>; paymentIdByMovement: Map<string, string> }> {
    const [receipts, payments] = await Promise.all([
      receiptMovementIds.length > 0
        ? this.bankReceiptRepo.find({ where: { depositMovementId: In(receiptMovementIds) } })
        : Promise.resolve([]),
      paymentMovementIds.length > 0
        ? this.bankPaymentRepo.find({ where: { depositMovementId: In(paymentMovementIds) } })
        : Promise.resolve([]),
    ]);
    return {
      receiptIdByMovement: new Map(receipts.map((r) => [r.depositMovementId as string, r.id])),
      paymentIdByMovement: new Map(payments.map((p) => [p.depositMovementId as string, p.id])),
    };
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
    query: DepositLedgerQueryDto,
    offset: number,
  ): Promise<number> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
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
    query: DepositLedgerQueryDto,
  ): Promise<number> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
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
    query: DepositLedgerQueryDto,
  ): Promise<{ totalIn: number; totalOut: number }> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
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
    query: DepositLedgerQueryDto,
    pageSize: number,
    offset: number,
  ): Promise<RawRow[]> {
    const { sql, params } = this.buildLegsSql(accountIds, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const fullSql = `SELECT id, ledger_account_id, type, amount, doc_date, document_number,
        recon_status, value_date, signed
      FROM (${sql}) legs
      ${ROW_ORDER}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    return this.movementRepo.query(fullSql, params);
  }
}

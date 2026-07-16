import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  DepositLedgerResponse,
  DepositLedgerRow,
  DepositMovementType,
  ReconStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../deposit-account.entity';
import { DepositMovementEntity } from '../deposit-movement.entity';
import { DepositLedgerQueryDto } from './dto/deposit-ledger-query.dto';
import { DepositBalanceService } from './deposit-balance.service';

const DEFAULT_PAGE_SIZE = 50;
// Row order must be identical everywhere so the running balance is deterministic (BR-LEDG-01).
const ROW_ORDER =
  'ORDER BY m.doc_date ASC, m.document_number ASC NULLS LAST, m.id ASC';

interface RawRow {
  id: string;
  deposit_account_id: string;
  to_account_id: string | null;
  type: string;
  amount: string;
  doc_date: string;
  document_number: string | null;
  recon_status: string;
  value_date: string | null;
}

/**
 * Sổ chi tiết tiền gửi (deposit detail ledger). Mirrors CashLedgerService: scalar
 * SUM/COUNT (no GROUP BY / window), running balance in RAM per page, offset pagination
 * with the page opening balance = global opening + signed sum of the rows before the page.
 * Two deposit specifics: opening balance adds the account's opening_balance (BR-LEDG-02),
 * and the range/order key is doc_date. Filters on (deposit_account_id = X OR to_account_id
 * = X) so transfers appear in both accounts' ledgers.
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

  /** Signed amount of a movement from account `$1`'s perspective. */
  private signedCase(): string {
    return `CASE
      WHEN m.type = 'DEPOSIT' THEN m.amount
      WHEN m.type = 'ADJUSTMENT' THEN m.amount
      WHEN m.type = 'WITHDRAWAL' THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.deposit_account_id = $1 THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.to_account_id = $1 THEN m.amount
      ELSE 0
    END`;
  }

  /** Build the shared WHERE (params start at $1=accountId, $2=org). */
  private buildWhere(
    accountId: string,
    org: string,
    branchId: string | undefined,
    bounds: { from?: string; to?: string; beforeDate?: string; search?: string },
  ): { where: string[]; params: unknown[] } {
    const params: unknown[] = [accountId, org];
    const where: string[] = [
      'm.organization_id = $2',
      '(m.deposit_account_id = $1 OR m.to_account_id = $1)',
    ];
    if (branchId) {
      params.push(branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    if (bounds.beforeDate) {
      params.push(bounds.beforeDate);
      where.push(`m.doc_date < $${params.length}::date`);
    }
    if (bounds.from) {
      params.push(bounds.from);
      where.push(`m.doc_date >= $${params.length}::date`);
    }
    if (bounds.to) {
      params.push(bounds.to);
      where.push(`m.doc_date <= $${params.length}::date`);
    }
    if (bounds.search) {
      params.push(`%${bounds.search}%`);
      where.push(`m.document_number ILIKE $${params.length}`);
    }
    return { where, params };
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

    const account = await this.accountRepo.findOne({
      where: { id: query.depositAccountId, organizationId: org, branchId: branch },
    });
    if (!account) {
      throw new NotFoundException(
        `Deposit account ${query.depositAccountId} not found for this branch`,
      );
    }
    const accId = account.id;

    const openingSigned = await this.sumSigned(accId, org, branch, {
      beforeDate: query.dateFrom,
    });
    const openingBalance = Number(account.openingBalance) + openingSigned;

    const { totalIn, totalOut } = await this.sumInOut(accId, org, branch, query);
    const total = await this.countInRange(accId, org, branch, query);

    const pageDelta =
      offset > 0
        ? await this.sumSignedBeforeOffset(accId, org, branch, query, offset)
        : 0;
    let running = openingBalance + pageDelta;

    const raw = await this.fetchPageRows(accId, org, branch, query, pageSize, offset);
    const rows: DepositLedgerRow[] = raw.map((r) => {
      const signed = this.signedJs(r, accId);
      const amountIn = signed > 0 ? signed : 0;
      const amountOut = signed < 0 ? -signed : 0;
      running += signed;
      return {
        id: r.id,
        docDate: r.doc_date,
        documentNumber: r.document_number,
        receiptNo: null, // bank_receipts land in GĐ2
        paymentNo: null, // bank_payments land in GĐ2
        depositAccountNo: account.accountNo,
        description: null,
        amountIn: String(amountIn),
        amountOut: String(amountOut),
        runningBalance: String(running),
        counterpartyName: null,
        staffName: null,
        reconStatus: r.recon_status as ReconStatus,
        valueDate: r.value_date,
        isCleared: !r.value_date || r.value_date <= this.today(),
      };
    });

    const { bookBalance, availableBalance, pendingClearingAmount } =
      await this.balanceService.getBalances(accId, actor);

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
    accountId: string,
    org: string,
    branchId: string | undefined,
    bounds: { beforeDate?: string },
  ): Promise<number> {
    const { where, params } = this.buildWhere(accountId, org, branchId, bounds);
    const rows = await this.movementRepo.query(
      `SELECT COALESCE(SUM(${this.signedCase()}), 0) AS sum FROM deposit_movements m WHERE ${where.join(
        ' AND ',
      )}`,
      params,
    );
    return Number(rows[0]?.sum ?? 0);
  }

  private async sumSignedBeforeOffset(
    accountId: string,
    org: string,
    branchId: string | undefined,
    query: DepositLedgerQueryDto,
    offset: number,
  ): Promise<number> {
    const { where, params } = this.buildWhere(accountId, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
    params.push(offset);
    const sql = `SELECT COALESCE(SUM(sub.s), 0) AS sum FROM (
        SELECT (${this.signedCase()}) AS s FROM deposit_movements m
        WHERE ${where.join(' AND ')}
        ${ROW_ORDER}
        LIMIT $${params.length}
      ) sub`;
    const rows = await this.movementRepo.query(sql, params);
    return Number(rows[0]?.sum ?? 0);
  }

  private async countInRange(
    accountId: string,
    org: string,
    branchId: string | undefined,
    query: DepositLedgerQueryDto,
  ): Promise<number> {
    const { where, params } = this.buildWhere(accountId, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
    const rows = await this.movementRepo.query(
      `SELECT COUNT(*)::int AS total FROM deposit_movements m WHERE ${where.join(
        ' AND ',
      )}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async sumInOut(
    accountId: string,
    org: string,
    branchId: string | undefined,
    query: DepositLedgerQueryDto,
  ): Promise<{ totalIn: number; totalOut: number }> {
    const { where, params } = this.buildWhere(accountId, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
    const signed = this.signedCase();
    const rows = await this.movementRepo.query(
      `SELECT
        COALESCE(SUM(CASE WHEN (${signed}) > 0 THEN (${signed}) ELSE 0 END), 0) AS "in",
        COALESCE(SUM(CASE WHEN (${signed}) < 0 THEN -(${signed}) ELSE 0 END), 0) AS "out"
      FROM deposit_movements m WHERE ${where.join(' AND ')}`,
      params,
    );
    return {
      totalIn: Number(rows[0]?.in ?? 0),
      totalOut: Number(rows[0]?.out ?? 0),
    };
  }

  private async fetchPageRows(
    accountId: string,
    org: string,
    branchId: string | undefined,
    query: DepositLedgerQueryDto,
    pageSize: number,
    offset: number,
  ): Promise<RawRow[]> {
    const { where, params } = this.buildWhere(accountId, org, branchId, {
      from: query.dateFrom,
      to: query.dateTo,
      search: query.search,
    });
    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const sql = `SELECT m.id, m.deposit_account_id, m.to_account_id, m.type, m.amount,
        m.doc_date, m.document_number, m.recon_status, m.value_date
      FROM deposit_movements m
      WHERE ${where.join(' AND ')}
      ${ROW_ORDER}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    return this.movementRepo.query(sql, params);
  }

  private signedJs(row: RawRow, accountId: string): number {
    const amount = Number(row.amount);
    switch (row.type) {
      case DepositMovementType.DEPOSIT:
      case DepositMovementType.ADJUSTMENT:
        return amount;
      case DepositMovementType.WITHDRAWAL:
        return -amount;
      case DepositMovementType.TRANSFER:
        if (row.deposit_account_id === accountId) return -amount;
        if (row.to_account_id === accountId) return amount;
        return 0;
      default:
        return 0;
    }
  }
}

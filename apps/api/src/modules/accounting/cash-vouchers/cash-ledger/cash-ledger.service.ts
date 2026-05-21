import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashMovementEntity, CashMovementType } from '../../cash/cash-movement.entity';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';
import { QueryCashLedgerDto } from './dto/query-cash-ledger.dto';

const NO_VOUCHER_LABEL = '(Chưa có chứng từ)';
const DEFAULT_LIMIT = 100;

export interface CashLedgerRow {
  movementId: string;
  date: Date;
  type: CashMovementType;
  voucherId: string | null;
  voucherNumber: string;
  kind: 'PT' | 'PC' | 'Khác';
  description: string | null;
  partnerName: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface CashLedgerResult {
  openingBalance: number;
  pageOpeningBalance: number;
  rows: CashLedgerRow[];
  pageClosingBalance: number;
  nextCursor: string | null;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

interface VoucherInfo {
  voucherId: string;
  voucherNumber: string | null;
  kind: 'PT' | 'PC';
  description: string | null;
  partnerName: string | null;
}

/**
 * Sổ chi tiết tiền mặt (cash detail ledger). Scalar `SUM` (no GROUP BY / window
 * function) for opening/closing/totals; running balance is computed in RAM per
 * page. Filters on `(cash_account_id = X OR to_account_id = X)` so internal
 * transfers appear in both the source and destination accounts' ledgers.
 */
@Injectable()
export class CashLedgerService {
  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly movementRepo: Repository<CashMovementEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly receiptRepo: Repository<CashReceiptEntity>,
    @InjectRepository(CashPaymentEntity)
    private readonly paymentRepo: Repository<CashPaymentEntity>,
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

  async getLedger(
    query: QueryCashLedgerDto,
    actor: ActorContext,
  ): Promise<CashLedgerResult> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const accountId = query.cashAccountId;
    const org = actor.organizationId;
    const branchId = query.branchId;
    const cursor = this.decodeCursor(query.cursor);

    // --- scalar SUMs (no GROUP BY) ----------------------------------------
    const openingBalance = await this.sumSigned(accountId, org, branchId, {
      dateToExclusive: query.dateFrom, // movements strictly before the range
    });

    const closingBalance = await this.sumSigned(accountId, org, branchId, {
      dateToInclusive: query.dateTo, // everything up to and including dateTo
    });

    const { totalDebit, totalCredit } = await this.sumDebitCredit(
      accountId,
      org,
      branchId,
      query.dateFrom,
      query.dateTo,
    );

    // Δ of in-range rows that precede the current page (before the cursor).
    const pageDelta = cursor
      ? await this.sumSigned(accountId, org, branchId, {
          dateFromInclusive: query.dateFrom,
          dateToInclusive: query.dateTo,
          beforeCursor: cursor,
        })
      : 0;
    const pageOpeningBalance = openingBalance + pageDelta;

    // --- page rows ---------------------------------------------------------
    const rawRows = await this.fetchPageRows(
      accountId,
      org,
      branchId,
      query.dateFrom,
      query.dateTo,
      cursor,
      limit + 1,
    );

    const hasMore = rawRows.length > limit;
    const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

    const voucherMap = await this.loadVouchers(
      pageRows.map((r) => r.id),
      org,
    );

    let running = pageOpeningBalance;
    const rows: CashLedgerRow[] = pageRows.map((r) => {
      const signed = this.signedJs(r, accountId);
      const debit = signed > 0 ? signed : 0;
      const credit = signed < 0 ? -signed : 0;
      running += signed;
      const voucher = voucherMap.get(r.id);
      return {
        movementId: r.id,
        date: r.created_at,
        type: r.type as CashMovementType,
        voucherId: voucher?.voucherId ?? null,
        voucherNumber: voucher?.voucherNumber ?? NO_VOUCHER_LABEL,
        kind: voucher?.kind ?? 'Khác',
        description: voucher?.description ?? r.notes ?? null,
        partnerName: voucher?.partnerName ?? null,
        debit,
        credit,
        balance: running,
      };
    });

    const pageClosingBalance = running;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? this.encodeCursor(lastRow.created_at, lastRow.id)
        : null;

    return {
      openingBalance,
      pageOpeningBalance,
      rows,
      pageClosingBalance,
      nextCursor,
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
    bounds: {
      dateFromInclusive?: string;
      dateToInclusive?: string;
      dateToExclusive?: string;
      beforeCursor?: { ts: string; id: string };
    },
  ): Promise<number> {
    const params: any[] = [accountId, org];
    const where: string[] = [
      'm.organization_id = $2',
      '(m.cash_account_id = $1 OR m.to_account_id = $1)',
    ];

    if (branchId) {
      params.push(branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    if (bounds.dateFromInclusive) {
      params.push(bounds.dateFromInclusive);
      where.push(`m.created_at >= $${params.length}::date`);
    }
    if (bounds.dateToInclusive) {
      params.push(bounds.dateToInclusive);
      where.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (bounds.dateToExclusive) {
      params.push(bounds.dateToExclusive);
      where.push(`m.created_at < $${params.length}::date`);
    }
    if (bounds.beforeCursor) {
      params.push(bounds.beforeCursor.ts);
      const tsIdx = params.length;
      params.push(bounds.beforeCursor.id);
      const idIdx = params.length;
      where.push(`(m.created_at, m.id) <= ($${tsIdx}::timestamptz, $${idIdx}::uuid)`);
    }

    const sql = `SELECT COALESCE(SUM(${this.signedCase()}), 0) AS sum
      FROM cash_movements m
      WHERE ${where.join(' AND ')}`;
    const rows = await this.movementRepo.query(sql, params);
    return Number(rows[0]?.sum ?? 0);
  }

  private async sumDebitCredit(
    accountId: string,
    org: string,
    branchId: string | undefined,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ totalDebit: number; totalCredit: number }> {
    const params: any[] = [accountId, org];
    const where: string[] = [
      'm.organization_id = $2',
      '(m.cash_account_id = $1 OR m.to_account_id = $1)',
    ];
    if (branchId) {
      params.push(branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`m.created_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const signed = this.signedCase();
    const sql = `SELECT
        COALESCE(SUM(CASE WHEN (${signed}) > 0 THEN (${signed}) ELSE 0 END), 0) AS debit,
        COALESCE(SUM(CASE WHEN (${signed}) < 0 THEN -(${signed}) ELSE 0 END), 0) AS credit
      FROM cash_movements m
      WHERE ${where.join(' AND ')}`;
    const rows = await this.movementRepo.query(sql, params);
    return {
      totalDebit: Number(rows[0]?.debit ?? 0),
      totalCredit: Number(rows[0]?.credit ?? 0),
    };
  }

  private async fetchPageRows(
    accountId: string,
    org: string,
    branchId: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    cursor: { ts: string; id: string } | null,
    take: number,
  ): Promise<
    Array<{
      id: string;
      cash_account_id: string;
      to_account_id: string | null;
      type: string;
      amount: string;
      notes: string | null;
      created_at: Date;
    }>
  > {
    const params: any[] = [accountId, org];
    const where: string[] = [
      'm.organization_id = $2',
      '(m.cash_account_id = $1 OR m.to_account_id = $1)',
    ];
    if (branchId) {
      params.push(branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`m.created_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (cursor) {
      params.push(cursor.ts);
      const tsIdx = params.length;
      params.push(cursor.id);
      const idIdx = params.length;
      where.push(`(m.created_at, m.id) > ($${tsIdx}::timestamptz, $${idIdx}::uuid)`);
    }
    params.push(take);
    const limitIdx = params.length;

    const sql = `SELECT m.id, m.cash_account_id, m.to_account_id, m.type, m.amount,
        m.notes, m.created_at
      FROM cash_movements m
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT $${limitIdx}`;
    return this.movementRepo.query(sql, params);
  }

  private async loadVouchers(
    movementIds: string[],
    org: string,
  ): Promise<Map<string, VoucherInfo>> {
    const map = new Map<string, VoucherInfo>();
    if (movementIds.length === 0) return map;

    const receipts = await this.receiptRepo.find({
      where: movementIds.map((id) => ({
        cashMovementId: id,
        organizationId: org,
      })),
    });
    for (const r of receipts) {
      if (!r.cashMovementId) continue;
      map.set(r.cashMovementId, {
        voucherId: r.id,
        voucherNumber: r.documentNumber ?? null,
        kind: 'PT',
        description: r.reason ?? null,
        partnerName: r.partnerNameSnapshot ?? r.payerName ?? null,
      });
    }

    const payments = await this.paymentRepo.find({
      where: movementIds.map((id) => ({
        cashMovementId: id,
        organizationId: org,
      })),
    });
    for (const p of payments) {
      if (!p.cashMovementId) continue;
      map.set(p.cashMovementId, {
        voucherId: p.id,
        voucherNumber: p.documentNumber ?? null,
        kind: 'PC',
        description: p.reason ?? null,
        partnerName: p.partnerNameSnapshot ?? p.payeeName ?? null,
      });
    }

    return map;
  }

  // ---------------------------------------------------------------------------
  // misc
  // ---------------------------------------------------------------------------

  private signedJs(
    row: { type: string; amount: string; cash_account_id: string; to_account_id: string | null },
    accountId: string,
  ): number {
    const amount = Number(row.amount);
    switch (row.type) {
      case CashMovementType.DEPOSIT:
      case CashMovementType.ADJUSTMENT:
        return amount;
      case CashMovementType.WITHDRAWAL:
        return -amount;
      case CashMovementType.TRANSFER:
        if (row.cash_account_id === accountId) return -amount;
        if (row.to_account_id === accountId) return amount;
        return 0;
      default:
        return 0;
    }
  }

  private encodeCursor(ts: Date, id: string): string {
    return Buffer.from(`${new Date(ts).toISOString()}|${id}`).toString('base64');
  }

  private decodeCursor(cursor?: string): { ts: string; id: string } | null {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const sep = decoded.lastIndexOf('|');
      if (sep < 0) return null;
      return { ts: decoded.slice(0, sep), id: decoded.slice(sep + 1) };
    } catch {
      return null;
    }
  }
}

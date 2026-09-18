import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  fixedBucketPredicate,
  voucherHeadersSql,
  voucherLinesSql,
} from './cash-fund-voucher.sql';

/** Who is asking: the organization and the branches the caller may read (null = all). */
export interface CashFundScope {
  organizationId: string;
  /** From `resolveReportBranchIds`; null means consolidated — no branch predicate. */
  branchIds: string[] | null;
}

/** One amount per fund — the two money columns of "Tình hình thu chi". */
export interface FundAmounts {
  cash: number;
  deposit: number;
}

export interface CashFundPeriodTotals {
  /** Receipts with purpose POS_SALE / DEBT_COLLECTION (A-02), from the voucher header. */
  inSales: FundAmounts;
  /** Payments with purpose PURCHASE / SUPPLIER_PAYMENT (A-02), from the voucher header. */
  outPurchase: FundAmounts;
  /** Every other receipt line with a category, keyed by `cash_voucher_categories.id`. */
  inByCategory: Record<string, FundAmounts>;
  /** What is left of the other receipts once categorised lines are taken out — "Thu khác". */
  inUncategorized: FundAmounts;
  outByCategory: Record<string, FundAmounts>;
  outUncategorized: FundAmounts;
}

export interface CashFundCategory {
  id: string;
  code: string;
  name: string;
  direction: 'IN' | 'OUT';
  displayOrder: number;
  isActive: boolean;
  deletedAt: string | null;
}

export const zeroFunds = (): FundAmounts => ({ cash: 0, deposit: 0 });

/** Money columns are numeric(18,2); keep every derived figure on that grid. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The SQL the five cash-fund reports share (ADR-03): posted cash and deposit
 * vouchers read as one relation on the voucher date. Definitions ask this
 * service for balances and sums and never touch the tables themselves, so the
 * status / reversal / soft-delete / branch rules live in exactly one place
 * (`cash-fund-voucher.sql.ts`).
 */
@Injectable()
export class CashFundPeriodService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Số dư đầu kỳ per fund (A-03): the signed sum of every posted voucher dated
   * before `from`, plus — on the deposit side — the `opening_balance` of each
   * account whose `opening_date` is on or before `from`. An account that opens
   * inside the period has no balance at its start (AC-06); one that opens on
   * `from` has its opening balance from the first minute of that day. Note the
   * deposit ledger (`deposit-ledger.service.ts`, BR-LEDG-02) adds the opening
   * balance regardless of date, so the two screens differ only for a period
   * that starts before the account existed.
   */
  async openingBalance(scope: CashFundScope, from: string): Promise<FundAmounts> {
    const params = [scope.organizationId, scope.branchIds, from];
    const rows = (await this.dataSource.query(
      `SELECT v.fund,
              COALESCE(SUM(CASE WHEN v.direction = 'in' THEN v.total_amount ELSE -v.total_amount END), 0) AS signed
         FROM (${voucherHeadersSql()}) v
        WHERE v.doc_date < $3::date
        GROUP BY v.fund`,
      params,
    )) as { fund: 'cash' | 'deposit'; signed: unknown }[];
    const opening = zeroFunds();
    for (const r of rows) opening[r.fund] = num(r.signed);

    const [deposit] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(a.opening_balance), 0) AS opening
         FROM deposit_accounts a
        WHERE a.organization_id = $1
          AND a.deleted_at IS NULL
          AND a.opening_date <= $3::date
          AND ($2::text[] IS NULL OR a.branch_id = ANY($2::text[]))`,
      [scope.organizationId, scope.branchIds, from],
    )) as { opening: unknown }[];
    opening.deposit += num(deposit?.opening);

    return { cash: round2(opening.cash), deposit: round2(opening.deposit) };
  }

  /**
   * Thu / chi trong kỳ, bucketed as "Tình hình thu chi" shows them (A-02).
   *
   * The fixed buckets are summed from voucher headers. Everything else is
   * summed from lines by category; whatever those headers total beyond their
   * categorised lines (lines with no category, vouchers with no lines at all)
   * becomes the uncategorised row — so II is always exactly the sum of its
   * rows, and the sum of its rows is always exactly the vouchers' total.
   */
  async periodTotals(
    scope: CashFundScope,
    from: string,
    to: string,
  ): Promise<CashFundPeriodTotals> {
    const params = [scope.organizationId, scope.branchIds, from, to];
    const inRange = `v.doc_date >= $3::date AND v.doc_date <= $4::date`;

    const headerRows = (await this.dataSource.query(
      `SELECT v.fund, v.direction,
              CASE WHEN ${fixedBucketPredicate('v')} THEN 'fixed' ELSE 'other' END AS bucket,
              COALESCE(SUM(v.total_amount), 0) AS amount
         FROM (${voucherHeadersSql()}) v
        WHERE ${inRange}
        GROUP BY v.fund, v.direction, bucket`,
      params,
    )) as {
      fund: 'cash' | 'deposit';
      direction: 'in' | 'out';
      bucket: 'fixed' | 'other';
      amount: unknown;
    }[];

    const lineRows = (await this.dataSource.query(
      `SELECT v.fund, v.direction, v.category_id, COALESCE(SUM(v.amount), 0) AS amount
         FROM (${voucherLinesSql()}) v
        WHERE ${inRange}
          AND v.category_id IS NOT NULL
          AND NOT ${fixedBucketPredicate('v')}
        GROUP BY v.fund, v.direction, v.category_id`,
      params,
    )) as {
      fund: 'cash' | 'deposit';
      direction: 'in' | 'out';
      category_id: string;
      amount: unknown;
    }[];

    const totals: CashFundPeriodTotals = {
      inSales: zeroFunds(),
      outPurchase: zeroFunds(),
      inByCategory: {},
      inUncategorized: zeroFunds(),
      outByCategory: {},
      outUncategorized: zeroFunds(),
    };
    const otherHeaders = { in: zeroFunds(), out: zeroFunds() };
    for (const r of headerRows) {
      if (r.bucket === 'fixed') {
        (r.direction === 'in' ? totals.inSales : totals.outPurchase)[r.fund] += num(r.amount);
      } else {
        otherHeaders[r.direction][r.fund] += num(r.amount);
      }
    }
    const categorised = { in: zeroFunds(), out: zeroFunds() };
    for (const r of lineRows) {
      const bucket = r.direction === 'in' ? totals.inByCategory : totals.outByCategory;
      bucket[r.category_id] ??= zeroFunds();
      bucket[r.category_id][r.fund] += num(r.amount);
      categorised[r.direction][r.fund] += num(r.amount);
    }
    for (const fund of ['cash', 'deposit'] as const) {
      totals.inUncategorized[fund] = round2(otherHeaders.in[fund] - categorised.in[fund]);
      totals.outUncategorized[fund] = round2(otherHeaders.out[fund] - categorised.out[fund]);
      totals.inSales[fund] = round2(totals.inSales[fund]);
      totals.outPurchase[fund] = round2(totals.outPurchase[fund]);
      for (const c of Object.values(totals.inByCategory)) c[fund] = round2(c[fund]);
      for (const c of Object.values(totals.outByCategory)) c[fund] = round2(c[fund]);
    }
    return totals;
  }

  /**
   * Every category of the organization, in display order — soft-deleted ones
   * included, because a posted voucher may still point at one and its money
   * must keep its name rather than fall into "khác". Dropdowns filter on
   * `isActive` / `deletedAt` themselves.
   */
  async categories(organizationId: string): Promise<CashFundCategory[]> {
    const rows = (await this.dataSource.query(
      `SELECT c.id, c.code, c.name, c.direction::text AS direction, c.display_order, c.is_active, c.deleted_at
         FROM cash_voucher_categories c
        WHERE c.organization_id = $1
        ORDER BY c.display_order ASC, c.name ASC`,
      [organizationId],
    )) as {
      id: string;
      code: string;
      name: string;
      direction: 'IN' | 'OUT';
      display_order: unknown;
      is_active: boolean;
      deleted_at: string | Date | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      direction: r.direction,
      displayOrder: num(r.display_order),
      isActive: !!r.is_active,
      deletedAt: r.deleted_at ? String(r.deleted_at) : null,
    }));
  }
}

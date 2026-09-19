import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CASH_FUND_UNCATEGORIZED } from '@erp/shared-interfaces';
import { CashFundScope, round2 } from './cash-fund-period.service';
import { fixedBucketPredicate, voucherLinesSql } from './cash-fund-voucher.sql';

/** One aggregate of "Chi tiền theo mục chi": `categoryId` null = lines without a category ("Chi khác"). */
export interface ExpenseCategorySum {
  categoryId: string | null;
  amount: number;
}

/** A WHERE fragment over the `v` relation of `voucherLinesSql()` plus its positional params. */
export interface ExpenseLinesWhere {
  where: string;
  params: unknown[];
}

/**
 * The expense lines the three "Chi tiền" reports (#4 / #5 / #6) read (A-12):
 * every line of a POSTED payment voucher — cash and deposit alike — whose
 * header is not a purchase / supplier payment. Those are "Chi mua hàng hóa",
 * a fixed line of "Tình hình thu chi", never a mục chi (A-02).
 *
 * Reads the shared relation of `cash-fund-voucher.sql.ts` and never the tables,
 * so the status / reversal / soft-delete / branch rules stay in one place.
 */
@Injectable()
export class ExpenseLinesQuery {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The predicate every expense report shares, on alias `v`:
   * direction out, voucher date in [from, to], outside the purchase bucket,
   * optionally restricted to `categoryIds` where `'uncategorized'` selects
   * `category_id IS NULL`. Params: $1 org, $2 branches, $3 from, $4 to, $5 ids.
   */
  whereClause(
    scope: CashFundScope,
    from: string,
    to: string,
    categoryIds?: string[],
  ): ExpenseLinesWhere {
    const params: unknown[] = [scope.organizationId, scope.branchIds, from, to];
    const conditions = [
      `v.direction = 'out'`,
      `v.doc_date >= $3::date AND v.doc_date <= $4::date`,
      `NOT ${fixedBucketPredicate('v')}`,
    ];
    if (categoryIds?.length) {
      const wantsUncategorized = categoryIds.includes(CASH_FUND_UNCATEGORIZED);
      const ids = categoryIds.filter((id) => id !== CASH_FUND_UNCATEGORIZED);
      const alternatives: string[] = [];
      if (wantsUncategorized) alternatives.push('v.category_id IS NULL');
      if (ids.length) {
        params.push(ids);
        alternatives.push(`v.category_id::text = ANY($${params.length}::text[])`);
      }
      conditions.push(`(${alternatives.join(' OR ')})`);
    }
    return { where: conditions.join('\n          AND '), params };
  }

  /** Σ amount per category (null = no category) for "Chi tiền theo mục chi". */
  async sumByCategory(
    scope: CashFundScope,
    from: string,
    to: string,
    categoryIds?: string[],
  ): Promise<ExpenseCategorySum[]> {
    const { where, params } = this.whereClause(scope, from, to, categoryIds);
    const rows = (await this.dataSource.query(
      `SELECT v.category_id, COALESCE(SUM(v.amount), 0) AS amount
         FROM (${voucherLinesSql()}) v
        WHERE ${where}
        GROUP BY v.category_id`,
      params,
    )) as { category_id: string | null; amount: unknown }[];
    return rows.map((r) => ({
      categoryId: r.category_id ?? null,
      amount: round2(Number(r.amount ?? 0) || 0),
    }));
  }
}

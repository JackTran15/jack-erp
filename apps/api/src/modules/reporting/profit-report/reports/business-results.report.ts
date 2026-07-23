import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import {
  PROFIT_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashPaymentLineEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment-line.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptLineEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt-line.entity';
import { CashVoucherCategoryEntity } from '../../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import {
  CashPaymentReferenceType,
  CashReceiptReferenceType,
  CashVoucherCategoryDirection,
  CashVoucherStatus,
} from '../../../accounting/cash-vouchers/enums';
import { BankReceiptEntity } from '../../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankReceiptLineEntity } from '../../../accounting/deposit-vouchers/bank-receipts/bank-receipt-line.entity';
import { BankPaymentEntity } from '../../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankPaymentLineEntity } from '../../../accounting/deposit-vouchers/bank-payments/bank-payment-line.entity';
import {
  BankPaymentReferenceType,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../../../accounting/deposit-vouchers/enums';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { InvoiceEntity, InvoiceType } from '../../../pos/entities/invoice.entity';
import { RbacService } from '../../../rbac/rbac.service';
import {
  applyBranchScope,
  CONSOLIDATED_PERMISSION,
  resolveBranchIds,
} from '../../report-core/report-query.util';
import {
  BusinessResultsRawValues,
  buildBusinessResultsRows,
  OtherLineCategory,
} from '../business-results.aggregator';
import { BUSINESS_RESULTS_COLUMNS, isKnownBusinessResultsColumn } from '../business-results.columns';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import { enrichHeader } from '../report-column.util';
import { ReportDefinition } from '../report-definition';

/**
 * "Kết quả kinh doanh" — fixed P&L statement (2.2 "Thu khác" and 3.2 "Chi phí
 * khác" both have DYNAMIC children — one row per cash-voucher category of the
 * matching direction + 1 uncategorized row), computed twice (previous
 * period, current period) and merged into a change-comparison table. Unlike
 * `profit-by-item`/`gross-profit-by-invoice`, rows are NOT DB entities — they
 * are a catalog of line items (see business-results.aggregator.ts).
 */
@Injectable()
export class BusinessResultsReport implements ReportDefinition {
  readonly key = 'business-results';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(CashPaymentEntity)
    private readonly cashPayments: Repository<CashPaymentEntity>,
    @InjectRepository(CashPaymentLineEntity)
    private readonly cashPaymentLines: Repository<CashPaymentLineEntity>,
    @InjectRepository(CashReceiptLineEntity)
    private readonly cashReceiptLines: Repository<CashReceiptLineEntity>,
    @InjectRepository(BankReceiptLineEntity)
    private readonly bankReceiptLines: Repository<BankReceiptLineEntity>,
    @InjectRepository(BankPaymentLineEntity)
    private readonly bankPaymentLines: Repository<BankPaymentLineEntity>,
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly cashVoucherCategories: Repository<CashVoucherCategoryEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(_actor: ActorContext): Promise<ReportColumnHeader[]> {
    return BUSINESS_RESULTS_COLUMNS.map((c) =>
      enrichHeader({
        col: c.key,
        name: PROFIT_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: ProfitReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const previous = dto.filters?.previousPeriod;
    const current = dto.filters?.currentPeriod;
    if (!previous?.from || !previous?.to) {
      throw new BadRequestException('filters.previousPeriod is required');
    }
    if (!current?.from || !current?.to) {
      throw new BadRequestException('filters.currentPeriod is required');
    }

    const unknown = dto.columns.filter((k) => !isKnownBusinessResultsColumn(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );
    const branchIds = resolveBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.filters.branchId,
      actor,
    );

    const [incomeCategories, expenseCategories, previousRaw, currentRaw] = await Promise.all([
      this.queryOtherCategories(actor.organizationId, CashVoucherCategoryDirection.IN),
      this.queryOtherCategories(actor.organizationId, CashVoucherCategoryDirection.OUT),
      this.queryPeriodRawValues(actor.organizationId, branchIds, previous.from, previous.to),
      this.queryPeriodRawValues(actor.organizationId, branchIds, current.from, current.to),
    ]);

    const rows = buildBusinessResultsRows(previousRaw, currentRaw, incomeCategories, expenseCategories);

    return {
      rows: rows as unknown as ReportRow[],
      totals: null,
      total: rows.length,
    };
  }

  private async queryPeriodRawValues(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<BusinessResultsRawValues> {
    const [
      goodsAndCogs,
      headerPromo,
      cashIncome,
      cashExpense,
      depositIncome,
      depositExpense,
    ] = await Promise.all([
      this.queryGoodsAndCogs(organizationId, branchIds, fromDate, toDate),
      this.queryHeaderPromo(organizationId, branchIds, fromDate, toDate),
      this.queryOtherIncomeByCategory(organizationId, branchIds, fromDate, toDate),
      this.queryOtherExpenseByCategory(organizationId, branchIds, fromDate, toDate),
      this.queryDepositOtherIncomeByCategory(organizationId, branchIds, fromDate, toDate),
      this.queryDepositOtherExpenseByCategory(organizationId, branchIds, fromDate, toDate),
    ]);
    // "Thu khác"/"Chi khác" gộp cả tiền mặt (phiếu thu/chi) lẫn tiền gửi (NTTK/UNC);
    // cùng dùng cash_voucher_categories nên trộn theo categoryId là khớp dòng.
    const otherIncome = this.mergeOtherLines(cashIncome, depositIncome);
    const otherExpense = this.mergeOtherLines(cashExpense, depositExpense);
    return {
      goodsSoldOut: goodsAndCogs.goodsSoldOut,
      goodsReturnedIn: goodsAndCogs.goodsReturnedIn,
      cogsOut: goodsAndCogs.cogsOut,
      cogsReturnedIn: goodsAndCogs.cogsReturnedIn,
      // "Khuyến mại" = per-line discount (invoice_items.lineDiscount, already
      // netted out of lineTotal — see goodsSoldOut/In below) + header-level
      // voucher/discount-code/promotion + loyalty points. Both pools are real
      // promotional spend; the invoice detail dialog shows per-line "KM ..."
      // labels that only ever hit lineDiscount, never invoice.discountAmount.
      promoOnSaleOut: goodsAndCogs.lineDiscountOut + headerPromo.headerSaleAndExchange,
      promoOnReturnIn: goodsAndCogs.lineDiscountIn + headerPromo.headerReturn,
      otherIncomeByCategory: otherIncome.byCategory,
      otherIncomeUncategorized: otherIncome.uncategorized,
      otherExpenseByCategory: otherExpense.byCategory,
      otherExpenseUncategorized: otherExpense.uncategorized,
    };
  }

  /**
   * 2.1.1.a/b (GROSS, before any discount) + 2.1.3.a/b's line-discount
   * component + 3.1.1/3.1.2 — split by line direction. "Tiền hàng bán ra"
   * must be the pre-discount list price (Σ quantity×unitPrice), not
   * `lineTotal` (which already has `lineDiscount` subtracted) — otherwise
   * per-line promotions silently vanish from "Khuyến mại" instead of showing
   * up there. lineTotal = quantity×unitPrice − lineDiscount always holds, so
   * goodsSoldOut(gross) − lineDiscountOut recovers the exact same net figure
   * the old lineTotal-based formula produced — this only re-attributes money
   * between 2.1.1 and 2.1.3, the I/II/III/IV totals are unaffected.
   */
  private async queryGoodsAndCogs(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{
    goodsSoldOut: number;
    goodsReturnedIn: number;
    lineDiscountOut: number;
    lineDiscountIn: number;
    cogsOut: number;
    cogsReturnedIn: number;
  }> {
    const qb = this.lineItems
      .createQueryBuilder('li')
      .innerJoin(InvoiceEntity, 'invoice', 'invoice.id = li.invoiceId')
      .where('invoice.organizationId = :orgId', { orgId: organizationId })
      .andWhere('invoice.issuedAt >= :fromDate', { fromDate })
      .andWhere('invoice.issuedAt <= :toDate', { toDate });
    applyBranchScope(qb, 'invoice', branchIds);

    const rows = await qb
      .select('li.direction', 'direction')
      .addSelect('COALESCE(SUM(li.quantity * li.unitPrice), 0)', 'grossSum')
      .addSelect('COALESCE(SUM(li.lineDiscount), 0)', 'lineDiscountSum')
      .addSelect('COALESCE(SUM(li.quantity * li.costPrice), 0)', 'cogsSum')
      .groupBy('li.direction')
      .getRawMany<{
        direction: ItemDirection;
        grossSum: string;
        lineDiscountSum: string;
        cogsSum: string;
      }>();

    const out = rows.find((r) => r.direction === ItemDirection.OUT);
    const inn = rows.find((r) => r.direction === ItemDirection.IN);
    return {
      goodsSoldOut: Number(out?.grossSum ?? 0),
      goodsReturnedIn: Number(inn?.grossSum ?? 0),
      lineDiscountOut: Number(out?.lineDiscountSum ?? 0),
      lineDiscountIn: Number(inn?.lineDiscountSum ?? 0),
      cogsOut: Number(out?.cogsSum ?? 0),
      cogsReturnedIn: Number(inn?.cogsSum ?? 0),
    };
  }

  /**
   * 2.1.3.a/b's HEADER-level component — Σ (discountAmount +
   * pointsDiscountAmount) per invoice header (voucher/discount-code/promotion
   * redemptions + loyalty points; `invoice.discountAmount` is a SEPARATE pool
   * from `invoice_items.lineDiscount`, summed from `invoice_promotions`, not a
   * rollup of line discounts — see queryGoodsAndCogs for the line-level half).
   * Split by invoice type; EXCHANGE is grouped with SALE ("a" — treated as a
   * new sale), per confirmed product decision (TKT-PRF-04).
   */
  private async queryHeaderPromo(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{ headerSaleAndExchange: number; headerReturn: number }> {
    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: organizationId })
      .andWhere('invoice.issuedAt >= :fromDate', { fromDate })
      .andWhere('invoice.issuedAt <= :toDate', { toDate });
    applyBranchScope(qb, 'invoice', branchIds);

    const rows = await qb
      .select('invoice.type', 'type')
      .addSelect(
        'COALESCE(SUM(invoice.discountAmount + invoice.pointsDiscountAmount), 0)',
        'promoSum',
      )
      .groupBy('invoice.type')
      .getRawMany<{ type: InvoiceType; promoSum: string }>();

    const saleAndExchange = rows
      .filter((r) => r.type === InvoiceType.SALE || r.type === InvoiceType.EXCHANGE)
      .reduce((sum, r) => sum + Number(r.promoSum ?? 0), 0);
    const returned = rows.find((r) => r.type === InvoiceType.RETURN);
    return {
      headerSaleAndExchange: saleAndExchange,
      headerReturn: Number(returned?.promoSum ?? 0),
    };
  }

  /**
   * 3.2.{i} — Σ CashPaymentLineEntity.amount for POSTED cash payments in the
   * period, GROUPED by category. A line counts toward its own category
   * (including one explicitly categorized "Chi khác"/CHI_KHAC) when set, or
   * toward the separate `uncategorized` bucket when the line has no category
   * at all. Lines whose category direction isn't OUT are excluded (shouldn't
   * happen for a "chi" voucher, but scoped explicitly for safety). REVERSED
   * vouchers are excluded (not an effective transaction).
   *
   * Excludes payments whose `referenceType` is already recognized elsewhere
   * in the P&L, to avoid double-counting:
   * - REFUND: cash refunded on a return invoice — that return already hits
   *   2.1.1.b/3.1.2 via invoice_items.
   * - GOODS_RECEIPT: paying a supplier for purchased inventory — an asset/AP
   *   event, not an accrual expense (COGS is recognized separately, at sale
   *   time, via 3.1).
   * - INVOICE_DEBT: settling a supplier payable — the expense was already
   *   recognized when the goods were received, not when the debt is paid.
   * - REVERSAL: a reversal voucher COPIES the original payment's lines with
   *   status=POSTED while the original flips to REVERSED (excluded by the
   *   status filter) — including it would re-add the very expense the
   *   reversal was meant to cancel.
   */
  private async queryOtherExpenseByCategory(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{ byCategory: Record<string, number>; uncategorized: number }> {
    const qb = this.cashPaymentLines
      .createQueryBuilder('line')
      .innerJoin(CashPaymentEntity, 'payment', 'payment.id = line.cashPaymentId')
      .leftJoin(CashVoucherCategoryEntity, 'category', 'category.id = line.categoryId')
      .where('payment.organizationId = :orgId', { orgId: organizationId })
      .andWhere('payment.status = :status', { status: CashVoucherStatus.POSTED })
      .andWhere('payment.postedAt >= :fromDate', { fromDate })
      .andWhere('payment.postedAt <= :toDate', { toDate })
      .andWhere('(line.categoryId IS NULL OR category.direction = :outDirection)', {
        outDirection: CashVoucherCategoryDirection.OUT,
      })
      .andWhere(
        '(payment.referenceType IS NULL OR payment.referenceType NOT IN (:...excludedRefTypes))',
        {
          excludedRefTypes: [
            CashPaymentReferenceType.REFUND,
            CashPaymentReferenceType.GOODS_RECEIPT,
            CashPaymentReferenceType.INVOICE_DEBT,
            CashPaymentReferenceType.REVERSAL,
          ],
        },
      );
    applyBranchScope(qb, 'payment', branchIds);

    const rows = await qb
      .select('line.categoryId', 'categoryId')
      .addSelect('COALESCE(SUM(line.amount), 0)', 'total')
      .groupBy('line.categoryId')
      .getRawMany<{ categoryId: string | null; total: string }>();

    const byCategory: Record<string, number> = {};
    let uncategorized = 0;
    for (const r of rows) {
      if (r.categoryId === null) {
        uncategorized += Number(r.total ?? 0);
      } else {
        byCategory[r.categoryId] = Number(r.total ?? 0);
      }
    }
    return { byCategory, uncategorized };
  }

  /**
   * 2.2.{i} — Σ CashReceiptLineEntity.amount for POSTED cash receipts in the
   * period, GROUPED by category. Same shape as `queryOtherExpenseByCategory`,
   * mirrored on the "phiếu thu" side.
   *
   * Excludes receipts whose `referenceType` is already recognized elsewhere
   * in the P&L, to avoid double-counting revenue/cash-conversion that isn't
   * genuinely NEW income:
   * - INVOICE: a POS sale payment — that revenue is already counted via
   *   invoice_items in 2.1.1.
   * - INVOICE_DEBT / RECEIVABLE: collecting an existing debt/receivable —
   *   cash converting from AR, not new revenue.
   * - REVERSAL: same reasoning as the expense side — a reversal receipt
   *   copies the original's lines with status=POSTED while the original
   *   flips to REVERSED, so including it would re-add income that was
   *   cancelled.
   */
  private async queryOtherIncomeByCategory(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{ byCategory: Record<string, number>; uncategorized: number }> {
    const qb = this.cashReceiptLines
      .createQueryBuilder('line')
      .innerJoin(CashReceiptEntity, 'receipt', 'receipt.id = line.cashReceiptId')
      .leftJoin(CashVoucherCategoryEntity, 'category', 'category.id = line.categoryId')
      .where('receipt.organizationId = :orgId', { orgId: organizationId })
      .andWhere('receipt.status = :status', { status: CashVoucherStatus.POSTED })
      .andWhere('receipt.postedAt >= :fromDate', { fromDate })
      .andWhere('receipt.postedAt <= :toDate', { toDate })
      .andWhere('(line.categoryId IS NULL OR category.direction = :inDirection)', {
        inDirection: CashVoucherCategoryDirection.IN,
      })
      .andWhere(
        '(receipt.referenceType IS NULL OR receipt.referenceType NOT IN (:...excludedRefTypes))',
        {
          excludedRefTypes: [
            CashReceiptReferenceType.INVOICE,
            CashReceiptReferenceType.INVOICE_DEBT,
            CashReceiptReferenceType.RECEIVABLE,
            CashReceiptReferenceType.REVERSAL,
          ],
        },
      );
    applyBranchScope(qb, 'receipt', branchIds);

    const rows = await qb
      .select('line.categoryId', 'categoryId')
      .addSelect('COALESCE(SUM(line.amount), 0)', 'total')
      .groupBy('line.categoryId')
      .getRawMany<{ categoryId: string | null; total: string }>();

    const byCategory: Record<string, number> = {};
    let uncategorized = 0;
    for (const r of rows) {
      if (r.categoryId === null) {
        uncategorized += Number(r.total ?? 0);
      } else {
        byCategory[r.categoryId] = Number(r.total ?? 0);
      }
    }
    return { byCategory, uncategorized };
  }

  /**
   * 2.2 (tiền gửi) — Σ BankReceiptLineEntity.amount for POSTED bank receipts
   * (phiếu thu tiền gửi, NTTK) in the period, GROUPED by category, mirroring
   * `queryOtherIncomeByCategory` on the deposit-fund side. Bank receipt lines
   * reference the SAME cash_voucher_categories rows, so a deposit line's amount
   * lands in the exact same 2.2 category row as its cash counterpart.
   *
   * Gated by `affectRevenue = true` — the deposit domain's explicit P&L intent
   * flag (system vouchers: transfers, fund swaps, supplier payments are all
   * `false`, so only genuine other-income manual receipts pass). REVERSAL is
   * excluded: a reversal voucher copies the original's `affectRevenue` and posts
   * with status POSTED while the original flips to REVERSED (dropped by the
   * status filter) — counting it would re-add the income the reversal cancelled.
   */
  private async queryDepositOtherIncomeByCategory(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{ byCategory: Record<string, number>; uncategorized: number }> {
    const qb = this.bankReceiptLines
      .createQueryBuilder('line')
      .innerJoin(BankReceiptEntity, 'receipt', 'receipt.id = line.bankReceiptId')
      .leftJoin(CashVoucherCategoryEntity, 'category', 'category.id = line.categoryId')
      .where('receipt.organizationId = :orgId', { orgId: organizationId })
      .andWhere('receipt.status = :status', { status: BankVoucherStatus.POSTED })
      .andWhere('receipt.affectRevenue = true')
      .andWhere('receipt.postedAt >= :fromDate', { fromDate })
      .andWhere('receipt.postedAt <= :toDate', { toDate })
      .andWhere('(line.categoryId IS NULL OR category.direction = :inDirection)', {
        inDirection: CashVoucherCategoryDirection.IN,
      })
      .andWhere('(receipt.referenceType IS NULL OR receipt.referenceType != :reversal)', {
        reversal: BankReceiptReferenceType.REVERSAL,
      });
    applyBranchScope(qb, 'receipt', branchIds);

    return this.collectByCategory(qb);
  }

  /**
   * 3.2 (tiền gửi) — Σ BankPaymentLineEntity.amount for POSTED bank payments
   * (phiếu chi tiền gửi, UNC) in the period, GROUPED by category. Mirror of
   * `queryDepositOtherIncomeByCategory` on the "phiếu chi" side; gated by
   * `affectExpense = true`, REVERSAL excluded for the same reason.
   */
  private async queryDepositOtherExpenseByCategory(
    organizationId: string,
    branchIds: string[] | null,
    fromDate: string,
    toDate: string,
  ): Promise<{ byCategory: Record<string, number>; uncategorized: number }> {
    const qb = this.bankPaymentLines
      .createQueryBuilder('line')
      .innerJoin(BankPaymentEntity, 'payment', 'payment.id = line.bankPaymentId')
      .leftJoin(CashVoucherCategoryEntity, 'category', 'category.id = line.categoryId')
      .where('payment.organizationId = :orgId', { orgId: organizationId })
      .andWhere('payment.status = :status', { status: BankVoucherStatus.POSTED })
      .andWhere('payment.affectExpense = true')
      .andWhere('payment.postedAt >= :fromDate', { fromDate })
      .andWhere('payment.postedAt <= :toDate', { toDate })
      .andWhere('(line.categoryId IS NULL OR category.direction = :outDirection)', {
        outDirection: CashVoucherCategoryDirection.OUT,
      })
      .andWhere('(payment.referenceType IS NULL OR payment.referenceType != :reversal)', {
        reversal: BankPaymentReferenceType.REVERSAL,
      });
    applyBranchScope(qb, 'payment', branchIds);

    return this.collectByCategory(qb);
  }

  /** Run a `(categoryId, Σ amount)` grouped query and split into by-category + uncategorized buckets. */
  private async collectByCategory<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): Promise<{ byCategory: Record<string, number>; uncategorized: number }> {
    const rows = await qb
      .select('line.categoryId', 'categoryId')
      .addSelect('COALESCE(SUM(line.amount), 0)', 'total')
      .groupBy('line.categoryId')
      .getRawMany<{ categoryId: string | null; total: string }>();

    const byCategory: Record<string, number> = {};
    let uncategorized = 0;
    for (const r of rows) {
      if (r.categoryId === null) {
        uncategorized += Number(r.total ?? 0);
      } else {
        byCategory[r.categoryId] = Number(r.total ?? 0);
      }
    }
    return { byCategory, uncategorized };
  }

  /** Sum two `{ byCategory, uncategorized }` results per category id (cash + tiền gửi). */
  private mergeOtherLines(
    a: { byCategory: Record<string, number>; uncategorized: number },
    b: { byCategory: Record<string, number>; uncategorized: number },
  ): { byCategory: Record<string, number>; uncategorized: number } {
    const byCategory: Record<string, number> = { ...a.byCategory };
    for (const [categoryId, amount] of Object.entries(b.byCategory)) {
      byCategory[categoryId] = (byCategory[categoryId] ?? 0) + amount;
    }
    return { byCategory, uncategorized: a.uncategorized + b.uncategorized };
  }

  /** Every active cash-voucher category of the given direction for the org — drives 2.2's/3.2's dynamic row set. */
  private async queryOtherCategories(
    organizationId: string,
    direction: CashVoucherCategoryDirection,
  ): Promise<OtherLineCategory[]> {
    const categories = await this.cashVoucherCategories.find({
      where: { organizationId, direction, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    return categories.map((c) => ({ id: c.id, name: c.name, displayOrder: c.displayOrder }));
  }
}

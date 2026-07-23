import {
  BUSINESS_RESULTS_LINE_BOLD,
  BUSINESS_RESULTS_LINE_INDENT,
  BUSINESS_RESULTS_LINE_KEYS,
  BUSINESS_RESULTS_LINE_LABELS_VI,
  BusinessResultsLineKey,
} from '@erp/shared-interfaces';

/**
 * Raw values queried from the DB for ONE period (called twice: previousPeriod,
 * currentPeriod). Everything else in the P&L tree is computed from these via
 * the confirmed formula tree — see TKT-PRF-04.
 */
export interface BusinessResultsRawValues {
  /** 2.1.1.a — Σ invoice_items.lineTotal, direction=OUT. */
  goodsSoldOut: number;
  /** 2.1.1.b — Σ invoice_items.lineTotal, direction=IN. */
  goodsReturnedIn: number;
  /** 2.1.3.a — Σ (invoice.discountAmount + pointsDiscountAmount), type IN (SALE, EXCHANGE). */
  promoOnSaleOut: number;
  /** 2.1.3.b — same, type = RETURN. */
  promoOnReturnIn: number;
  /** 2.2.{i} — categoryId -> Σ POSTED receipt-line amounts, category.direction=IN, from cash (CashReceiptLineEntity) + deposit (BankReceiptLineEntity, affectRevenue) vouchers combined. */
  otherIncomeByCategory: Record<string, number>;
  /** 2.2.{last} "Thu khác" — same as above where categoryId IS NULL. */
  otherIncomeUncategorized: number;
  /** 3.1.1 — Σ (invoice_items.quantity × costPrice), direction=OUT. */
  cogsOut: number;
  /** 3.1.2 raw magnitude — Σ (invoice_items.quantity × costPrice), direction=IN (stored positive; negated below). */
  cogsReturnedIn: number;
  /** 3.2.{i} — categoryId -> Σ POSTED payment-line amounts, category.direction=OUT, from cash (CashPaymentLineEntity) + deposit (BankPaymentLineEntity, affectExpense) vouchers combined. */
  otherExpenseByCategory: Record<string, number>;
  /** 3.2.{last} "Chi khác" — same as above where categoryId IS NULL. */
  otherExpenseUncategorized: number;
}

/** One cash-voucher category (IN or OUT direction), used to generate 2.2's/3.2's dynamic sub-rows. */
export interface OtherLineCategory {
  id: string;
  /** Real category name (business data, e.g. "Tiền điện") — not a translated UI string. */
  name: string;
  displayOrder: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function changePercent(kyTruoc: number | null, kyHienTai: number | null): number | null {
  if (kyTruoc === null || kyHienTai === null || kyTruoc === 0) return null;
  return round2((kyHienTai / kyTruoc) * 100 - 100);
}

function changeAmount(kyTruoc: number | null, kyHienTai: number | null): number | null {
  if (kyTruoc === null || kyHienTai === null) return null;
  return round2(kyHienTai - kyTruoc);
}

/** Compute the fixed-line P&L tree for one period from its raw summed inputs. */
export function computeBusinessResultsPeriod(
  raw: BusinessResultsRawValues,
): Record<BusinessResultsLineKey, number | null> {
  const fee = 0; // 2.1.2 — no backing field on InvoiceEntity yet
  const otherIncome = round2(
    Object.values(raw.otherIncomeByCategory).reduce((s, v) => s + v, 0) +
      raw.otherIncomeUncategorized,
  ); // 2.2 = Σ mọi category IN + "Thu khác" (uncategorized)

  const goodsRevenue = round2(raw.goodsSoldOut - raw.goodsReturnedIn); // 2.1.1
  const promo = round2(raw.promoOnSaleOut - raw.promoOnReturnIn); // 2.1.3
  const salesRevenue = round2(goodsRevenue + fee - promo); // 2.1
  const revenue = round2(salesRevenue + otherIncome); // II
  const salesVolume = round2(raw.goodsSoldOut + fee - raw.promoOnSaleOut); // I

  const cogsReturnedIn = round2(-raw.cogsReturnedIn); // 3.1.2 (negative)
  const cogs = round2(raw.cogsOut + cogsReturnedIn); // 3.1
  const otherExpenseGroup = round2(
    Object.values(raw.otherExpenseByCategory).reduce((s, v) => s + v, 0) +
      raw.otherExpenseUncategorized,
  ); // 3.2 = Σ mọi category OUT + "Chi khác" (uncategorized)
  const expense = round2(cogs + otherExpenseGroup); // III

  const cogsToRevenueRatio = revenue !== 0 ? round2((cogs / revenue) * 100) : null; // 3.3
  const otherExpenseToRevenueRatio =
    revenue !== 0 ? round2((otherExpenseGroup / revenue) * 100) : null; // 3.4

  const profit = round2(revenue - expense); // IV

  return {
    [BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME]: salesVolume,
    [BUSINESS_RESULTS_LINE_KEYS.REVENUE]: revenue,
    [BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE]: salesRevenue,
    [BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE]: goodsRevenue,
    [BUSINESS_RESULTS_LINE_KEYS.GOODS_SOLD_OUT]: round2(raw.goodsSoldOut),
    [BUSINESS_RESULTS_LINE_KEYS.GOODS_RETURNED_IN]: round2(raw.goodsReturnedIn),
    [BUSINESS_RESULTS_LINE_KEYS.FEE]: fee,
    [BUSINESS_RESULTS_LINE_KEYS.PROMO]: promo,
    [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_SALE_OUT]: round2(raw.promoOnSaleOut),
    [BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_RETURN_IN]: round2(raw.promoOnReturnIn),
    [BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME]: otherIncome,
    [BUSINESS_RESULTS_LINE_KEYS.EXPENSE]: expense,
    [BUSINESS_RESULTS_LINE_KEYS.COGS]: cogs,
    [BUSINESS_RESULTS_LINE_KEYS.COGS_OUT]: round2(raw.cogsOut),
    [BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN]: cogsReturnedIn,
    [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP]: otherExpenseGroup,
    [BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO]: cogsToRevenueRatio,
    [BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO]: otherExpenseToRevenueRatio,
    [BUSINESS_RESULTS_LINE_KEYS.PROFIT]: profit,
  };
}

/** Display order of the fixed lines, top to bottom (3.2's dynamic children are spliced in separately). */
export const BUSINESS_RESULTS_LINE_ORDER: BusinessResultsLineKey[] = [
  BUSINESS_RESULTS_LINE_KEYS.SALES_VOLUME,
  BUSINESS_RESULTS_LINE_KEYS.REVENUE,
  BUSINESS_RESULTS_LINE_KEYS.SALES_REVENUE,
  BUSINESS_RESULTS_LINE_KEYS.GOODS_REVENUE,
  BUSINESS_RESULTS_LINE_KEYS.GOODS_SOLD_OUT,
  BUSINESS_RESULTS_LINE_KEYS.GOODS_RETURNED_IN,
  BUSINESS_RESULTS_LINE_KEYS.FEE,
  BUSINESS_RESULTS_LINE_KEYS.PROMO,
  BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_SALE_OUT,
  BUSINESS_RESULTS_LINE_KEYS.PROMO_ON_RETURN_IN,
  BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME,
  BUSINESS_RESULTS_LINE_KEYS.EXPENSE,
  BUSINESS_RESULTS_LINE_KEYS.COGS,
  BUSINESS_RESULTS_LINE_KEYS.COGS_OUT,
  BUSINESS_RESULTS_LINE_KEYS.COGS_RETURNED_IN,
  BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP,
  BUSINESS_RESULTS_LINE_KEYS.COGS_TO_REVENUE_RATIO,
  BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_TO_REVENUE_RATIO,
  BUSINESS_RESULTS_LINE_KEYS.PROFIT,
];

interface DynamicLine {
  key: string;
  label: string;
  value: number;
}

interface DynamicLineGroupSpec {
  /** "2.2" or "3.2" — numbering prefix for this group's rows. */
  prefix: string;
  /** Row label for the uncategorized bucket, e.g. "Thu khác" / "Chi khác". */
  uncategorizedLabel: string;
  byCategory: Record<string, number>;
  uncategorized: number;
  /** Prefix for this group's dynamic row `key`s, to keep 2.2 vs 3.2 keys distinct. */
  keyPrefix: string;
}

/**
 * One group's (2.2 or 3.2) dynamic children: one row per cash-voucher
 * category of the matching direction (ordered by `displayOrder`, labeled
 * with the category's real name), plus a final uncategorized row for lines
 * with NO category set. A line with an explicit category — even one named
 * e.g. "Chi khác" (code CHI_KHAC) — counts toward ITS OWN category row, not
 * this uncategorized bucket.
 */
function buildDynamicLines(categories: OtherLineCategory[], spec: DynamicLineGroupSpec): DynamicLine[] {
  const sorted = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const categoryLines = sorted.map((cat, i) => ({
    key: `${spec.keyPrefix}:${cat.id}`,
    label: `${spec.prefix}.${i + 1} ${cat.name}`,
    value: round2(spec.byCategory[cat.id] ?? 0),
  }));
  const uncategorizedLine: DynamicLine = {
    key: `${spec.keyPrefix}:uncategorized`,
    label: `${spec.prefix}.${sorted.length + 1} ${spec.uncategorizedLabel}`,
    value: round2(spec.uncategorized),
  };
  return [...categoryLines, uncategorizedLine];
}

function buildOtherIncomeDynamicLines(
  raw: BusinessResultsRawValues,
  categories: OtherLineCategory[],
): DynamicLine[] {
  return buildDynamicLines(categories, {
    prefix: '2.2',
    uncategorizedLabel: 'Thu khác',
    byCategory: raw.otherIncomeByCategory,
    uncategorized: raw.otherIncomeUncategorized,
    keyPrefix: 'otherIncomeCategory',
  });
}

function buildOtherExpenseDynamicLines(
  raw: BusinessResultsRawValues,
  categories: OtherLineCategory[],
): DynamicLine[] {
  return buildDynamicLines(categories, {
    prefix: '3.2',
    uncategorizedLabel: 'Chi khác',
    byCategory: raw.otherExpenseByCategory,
    uncategorized: raw.otherExpenseUncategorized,
    keyPrefix: 'otherExpenseCategory',
  });
}

/**
 * Build the full report rows: fixed lines (previous vs current merged) with
 * 2.2's and 3.2's dynamic category rows spliced in right after "2.2. Thu
 * khác" / "3.2. Chi phí khác" respectively. `incomeCategories`/
 * `expenseCategories` are org-level (period-independent) so both periods
 * share the exact same dynamic row set/order — only their values differ.
 */
export function buildBusinessResultsRows(
  previousRaw: BusinessResultsRawValues,
  currentRaw: BusinessResultsRawValues,
  incomeCategories: OtherLineCategory[],
  expenseCategories: OtherLineCategory[],
): Array<Record<string, string | number | null>> {
  const previous = computeBusinessResultsPeriod(previousRaw);
  const current = computeBusinessResultsPeriod(currentRaw);

  const staticRows = BUSINESS_RESULTS_LINE_ORDER.map((key) => {
    const kyTruoc = previous[key];
    const kyHienTai = current[key];
    return {
      key: key as string,
      khoanMuc: BUSINESS_RESULTS_LINE_LABELS_VI[key],
      kyTruoc,
      kyHienTai,
      thayDoiPercent: changePercent(kyTruoc, kyHienTai),
      thayDoiSoTien: changeAmount(kyTruoc, kyHienTai),
      indentLevel: BUSINESS_RESULTS_LINE_INDENT[key],
      bold: BUSINESS_RESULTS_LINE_BOLD[key] ? 1 : 0,
    };
  });

  const buildDynamicRows = (
    build: (raw: BusinessResultsRawValues, categories: OtherLineCategory[]) => DynamicLine[],
    categories: OtherLineCategory[],
  ) => {
    const previousByKey = new Map(build(previousRaw, categories).map((l) => [l.key, l.value]));
    return build(currentRaw, categories).map((cur) => {
      const kyTruoc = previousByKey.get(cur.key) ?? 0;
      const kyHienTai = cur.value;
      return {
        key: cur.key,
        khoanMuc: cur.label,
        kyTruoc,
        kyHienTai,
        thayDoiPercent: changePercent(kyTruoc, kyHienTai),
        thayDoiSoTien: changeAmount(kyTruoc, kyHienTai),
        indentLevel: 2,
        bold: 0,
      };
    });
  };

  type Row = { key: string } & Record<string, string | number | null>;
  const insertAfter = (rows: Row[], key: BusinessResultsLineKey, toInsert: Row[]): Row[] => {
    const idx = rows.findIndex((r) => r.key === key) + 1;
    return [...rows.slice(0, idx), ...toInsert, ...rows.slice(idx)];
  };

  const incomeDynamicRows = buildDynamicRows(buildOtherIncomeDynamicLines, incomeCategories);
  const expenseDynamicRows = buildDynamicRows(buildOtherExpenseDynamicLines, expenseCategories);

  let merged = insertAfter(staticRows, BUSINESS_RESULTS_LINE_KEYS.OTHER_INCOME, incomeDynamicRows);
  merged = insertAfter(merged, BUSINESS_RESULTS_LINE_KEYS.OTHER_EXPENSE_GROUP, expenseDynamicRows);

  return merged.map(({ key: _key, ...row }) => row);
}

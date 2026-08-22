import { BadRequestException, Injectable } from '@nestjs/common';
import { parseBranchQtyColumnKey, type ReportTotals } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import {
  buildReportColumnFilter,
  type ReportColumnFilters,
  type ReportColumnSpecs,
  type ReportFilterFragment,
} from './report-column-filter.util';
import { type ItemGroupBy } from './stock-period.service';

/** One definition each, so the predicate and the rendered cell cannot drift. */
const PIVOT_COLOR_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) IN ('màu sắc', 'màu', 'color')
         LIMIT 1)`;

const PIVOT_SIZE_SQL = `(SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) = 'size'
         LIMIT 1)`;

/**
 * The joins the item-level specs resolve against.
 *
 * `itemPageSql` and `itemCountSql` both joined only `items`, because until now
 * this engine hashed `columnFilters` into the cache key and never compiled them
 * into SQL at all. Both take the same fragment, so any spec naming `ic` or `pr`
 * has to find the relation in both (ADR-04). Many-to-one, so the count is
 * unchanged.
 */
const PIVOT_ITEM_JOINS = `
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = $1`;

/**
 * Columns the pivot can filter on, at the stage where the item for a row is
 * chosen — before the per-branch cells fan out. A predicate applied after that
 * fan-out would filter cells rather than rows.
 */
const PIVOT_COLUMN_SPECS: ReportColumnSpecs = {
  sku: { sql: 'i.code', kind: 'text' },
  name: { sql: 'i.name', kind: 'text' },
  unit: { sql: 'i.unit', kind: 'text' },
  brand: { sql: 'i.brand', kind: 'text' },
  group: { sql: 'ic.name', kind: 'text' },
  parentSku: { sql: 'pr.code', kind: 'text' },
  parentName: { sql: 'pr.name', kind: 'text' },
  color: { sql: PIVOT_COLOR_SQL, kind: 'text' },
  size: { sql: PIVOT_SIZE_SQL, kind: 'text' },
};

/**
 * The row's org-wide quantity, rebuilt at the item-choosing step.
 *
 * The grid's "Tổng" only exists after `foldCells` adds the per-branch cells up
 * in JS, so filtering it has to recreate the sum in SQL — and under the same
 * branch scope the page uses, or the total would count branches the request
 * excluded.
 */
const PIVOT_TOTAL_SQL = `(
        SELECT COALESCE(SUM(sbt.quantity), 0)
        FROM stock_balances sbt
        WHERE sbt.item_id = i.id AND sbt.organization_id = $1
          AND ($2::text[] IS NULL OR sbt.branch_id = ANY($2::text[]))
      )`;

/** A UUID, and nothing that could reach SQL as anything else. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Specs for the per-branch columns, generated for the keys a request actually
 * filters on.
 *
 * The pivot's branch columns are `branch.qty.<branchId>`, so how many there are
 * depends on the organisation — a static map cannot express them. This is the
 * one place in the report layer where a key supplied by the caller takes part in
 * building SQL, which is why the id is validated as a UUID and then bound as a
 * positional parameter rather than interpolated: `bind` appends to the same
 * params array the rest of the fragment uses.
 */
function pivotBranchSpecs(
  filters: ReportColumnFilters | undefined,
  startIndex: number,
): { specs: ReportColumnSpecs; params: string[] } {
  const specs: ReportColumnSpecs = {};
  const params: string[] = [];

  for (const key of Object.keys(filters ?? {})) {
    const branchId = parseBranchQtyColumnKey(key);
    if (!branchId) continue;
    if (!UUID_RE.test(branchId)) {
      throw new BadRequestException(`Cột "${key}" không phải mã chi nhánh hợp lệ`);
    }
    // Bound ahead of the filter values so the index is fixed and known here;
    // `buildReportColumnFilter` then starts numbering after these.
    params.push(branchId);
    const index = startIndex + params.length;
    specs[key] = {
      sql: `(
        SELECT COALESCE(SUM(sbb.quantity), 0)
        FROM stock_balances sbb
        WHERE sbb.item_id = i.id AND sbb.organization_id = $1
          AND sbb.branch_id = $${index}
      )`,
      kind: 'number',
    };
  }

  return { specs, params };
}

export interface StockBalancePivotQuery {
  /** Lọc theo cột, áp phía server nên tác dụng trên toàn tập. */
  columnFilters?: ReportColumnFilters;
  organizationId: string;
  itemGroupBy?: ItemGroupBy;
  branchIds?: string[];
  categoryIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
}

export interface StockBalancePivotBranchCell {
  branchId: string;
  branchName: string;
  qty: number;
  value: number;
}

export interface StockBalancePivotRow {
  itemId: string;
  sku: string;
  name: string;
  parentSku: string | null;
  parentName: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  totalQty: number;
  totalValue: number;
  perBranch: Record<string, StockBalancePivotBranchCell>;
}

export interface StockBalancePivotBranchHeader {
  id: string;
  code: string | null;
  name: string;
}

export interface StockBalancePivotResult {
  data: StockBalancePivotRow[];
  branches: StockBalancePivotBranchHeader[];
  total: number;
  /**
   * Tổng trên **toàn tập** mã hàng đã lọc, không phải trang hiện tại.
   * `total` là tổng chung; mỗi chi nhánh có khoá riêng `perBranch.<branchId>`.
   * Các ô của lưới chỉ tính cho `itemIds` của trang, nên tổng phải là một truy
   * vấn riêng — nếu cộng các ô lại sẽ chỉ ra tổng của trang.
   */
  totals: ReportTotals;
}

/**
 * Báo cáo 5 — Số lượng tồn theo cửa hàng (pivot).
 *
 * Supports three item-dimension modes (itemGroupBy):
 *   'item'   — one row per SKU  (default)
 *   'parent' — one row per parent product (variants aggregated)
 *   'group'  — one row per category
 */
@Injectable()
export class StockBalancePivotService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tổng tồn theo từng chi nhánh trên toàn bộ mã hàng đã lọc.
   *
   * Dùng đúng bộ điều kiện chọn mã hàng của `itemCountSql` — cùng một tập, nên
   * cột "Tổng" ở footer luôn bằng tổng các cột chi nhánh.
   */
  /**
   * The footer.
   *
   * It is a separate query from the grid's, which makes it the easiest place to
   * forget a predicate — and a footer describing a different set than the rows
   * above it is exactly what ADR-04 exists to prevent. Hence the same fragment.
   */
  private async loadBranchTotals(
    orgId: string,
    branchIds: string[] | null,
    categoryIds: string[] | null,
    search: string | null,
    columnFilter: ReportFilterFragment,
  ): Promise<ReportTotals> {
    const filterWhere = columnFilter.where ? `AND ${columnFilter.where}` : '';
    const rows: Array<{ branch_id: string | null; qty: string }> =
      await this.dataSource.query(
        `
        SELECT sb.branch_id AS branch_id, COALESCE(SUM(sb.quantity), 0)::numeric AS qty
        FROM stock_balances sb
        JOIN items i ON i.id = sb.item_id AND i.organization_id = $1
        ${PIVOT_ITEM_JOINS}
        WHERE sb.organization_id = $1
          AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
          AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
          AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
          ${filterWhere}
        GROUP BY sb.branch_id
      `,
        [orgId, branchIds, categoryIds, search, ...columnFilter.params],
      );

    const totals: ReportTotals = { total: 0 };
    for (const row of rows) {
      const qty = Number(row.qty ?? 0);
      totals.total += qty;
      if (row.branch_id) totals[`perBranch.${row.branch_id}`] = qty;
    }
    return totals;
  }

  async aggregate(query: StockBalancePivotQuery): Promise<StockBalancePivotResult> {
    const itemGroupBy: ItemGroupBy = query.itemGroupBy ?? 'item';
    const branchIds = query.branchIds?.length ? query.branchIds : null;
    const categoryIds = query.categoryIds?.length ? query.categoryIds : null;
    const search = query.search?.trim().length ? query.search.trim() : null;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    // Built once and spliced into the page query, the count query and the
    // footer query, so the three cannot describe different sets (ADR-04).
    //
    // The parent/group grain gets an empty spec map on purpose: a row there is a
    // product or a category, not an item, so `color` or `size` have no value to
    // compare against. Filtering one answers 400 rather than being dropped
    // silently, which would leave the grid looking filtered while it is not.
    const branch = itemGroupBy === 'item'
      ? pivotBranchSpecs(query.columnFilters, 4)
      : { specs: {}, params: [] as string[] };

    const columnFilter = buildReportColumnFilter(
      query.columnFilters,
      itemGroupBy === 'item'
        ? {
            ...PIVOT_COLUMN_SPECS,
            total: { sql: PIVOT_TOTAL_SQL, kind: 'number' },
            ...branch.specs,
          }
        : {},
      4 + branch.params.length,
    );
    // The branch ids sit between the scope parameters and the filter values, so
    // both halves keep the indices they were built with.
    const filterFragment: ReportFilterFragment = {
      where: columnFilter.where,
      params: [...branch.params, ...columnFilter.params],
    };

    if (itemGroupBy === 'item') {
      return this.aggregateByItem(
        query.organizationId, branchIds, categoryIds, search, page, pageSize, offset,
        filterFragment,
      );
    }
    return this.aggregateByAgg(
      query.organizationId, branchIds, categoryIds, search, page, pageSize, offset, itemGroupBy,
      filterFragment,
    );
  }

  // ─── item mode (original behaviour) ─────────────────────────────────────────

  private async aggregateByItem(
    orgId: string,
    branchIds: string[] | null,
    categoryIds: string[] | null,
    search: string | null,
    page: number,
    pageSize: number,
    offset: number,
    columnFilter: ReportFilterFragment,
  ): Promise<StockBalancePivotResult> {
    const filterWhere = columnFilter.where ? `AND ${columnFilter.where}` : '';
    const baseParams = [orgId, branchIds, categoryIds, search, ...columnFilter.params];
    const limitIndex = baseParams.length + 1;

    const itemPageSql = `
      SELECT i.id AS item_id, i.code AS sku
      FROM items i
      ${PIVOT_ITEM_JOINS}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
        ${filterWhere}
      ORDER BY i.code ASC
      LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
    `;
    const itemCountSql = `
      SELECT COUNT(*)::int AS total
      FROM items i
      ${PIVOT_ITEM_JOINS}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
        ${filterWhere}
    `;

    const [itemRows, countRows, totals] = await Promise.all([
      this.dataSource.query(itemPageSql, [...baseParams, pageSize, offset]),
      this.dataSource.query(itemCountSql, baseParams),
      this.loadBranchTotals(orgId, branchIds, categoryIds, search, columnFilter),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const itemIds = (itemRows as Array<{ item_id: string }>).map((r) => r.item_id);
    if (itemIds.length === 0) return { data: [], branches: [], total, totals };

    const cellSql = `
      SELECT
        i.id             AS agg_key,
        i.code           AS sku,
        i.name           AS item_name,
        pr.code          AS parent_sku,
        pr.name          AS parent_name,
        i.unit           AS unit,
        ic.id            AS category_id,
        ic.name          AS category_name,
        i.brand          AS brand,
        (SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) IN ('màu sắc', 'màu', 'color')
         LIMIT 1) AS color,
        (SELECT pao.value_label FROM item_attribute_values iav
         JOIN product_attribute_definitions pad ON pad.id = iav.attribute_definition_id
         JOIN product_attribute_options pao ON pao.id = iav.option_id
         WHERE iav.item_id = i.id AND LOWER(pad.name) = 'size'
         LIMIT 1) AS size,
        b.id             AS branch_id,
        b.name           AS branch_name,
        SUM(sb.quantity)::numeric                                AS qty,
        SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
      FROM stock_balances sb
      JOIN  items i   ON i.id = sb.item_id AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN branches b  ON b.id::text = sb.branch_id
      WHERE sb.organization_id = $1
        AND sb.item_id = ANY($2)
        AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
      GROUP BY i.id, i.code, i.name, pr.code, pr.name, i.unit, ic.id, ic.name, b.id, b.name
      ORDER BY i.code ASC, b.name ASC NULLS LAST
    `;
    const cellRows = (await this.dataSource.query(cellSql, [
      orgId, itemIds, branchIds,
    ])) as RawPivotCell[];

    return this.foldCells(cellRows, itemIds, total, totals);
  }

  // ─── parent / group aggregation ──────────────────────────────────────────────

  private async aggregateByAgg(
    orgId: string,
    branchIds: string[] | null,
    categoryIds: string[] | null,
    search: string | null,
    page: number,
    pageSize: number,
    offset: number,
    itemGroupBy: 'parent' | 'group',
    columnFilter: ReportFilterFragment,
  ): Promise<StockBalancePivotResult> {
    const isParent = itemGroupBy === 'parent';

    const aggKeyExpr = isParent
      ? `COALESCE(i.product_id::text, i.id::text)`
      : `i.category_id::text`;
    const displaySkuExpr = isParent
      ? `COALESCE(pr.code, i.code)`
      : `ic.name`;
    const joinProduct = isParent
      ? `LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = $1`
      : '';
    const joinCategory = isParent
      ? `LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id`
      : `LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id`;

    // Step 1: paginate distinct agg_keys
    const pageParams = [orgId, branchIds, categoryIds, search];
    const aggPageSql = `
      SELECT DISTINCT
        ${aggKeyExpr} AS agg_key,
        ${isParent ? `COALESCE(pr.code, i.code)` : `COALESCE(ic.name, 'Không phân nhóm')`} AS display_sku
      FROM items i
      ${joinProduct}
      ${joinCategory}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
      ORDER BY display_sku ASC NULLS LAST
      LIMIT $5 OFFSET $6
    `;
    const aggCountSql = `
      SELECT COUNT(DISTINCT ${aggKeyExpr})::int AS total
      FROM items i
      ${joinProduct}
      WHERE i.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM stock_balances sb
          WHERE sb.organization_id = $1 AND sb.item_id = i.id
            AND ($2::text[] IS NULL OR sb.branch_id = ANY($2::text[]))
        )
        AND ($3::uuid[] IS NULL OR i.category_id = ANY($3))
        AND ($4::text IS NULL OR i.code ILIKE '%' || $4 || '%' OR i.name ILIKE '%' || $4 || '%')
    `;

    const [aggRows, countRows, totals] = await Promise.all([
      this.dataSource.query(aggPageSql, [...pageParams, pageSize, offset]),
      this.dataSource.query(aggCountSql, pageParams),
      // Cùng tập stock_balances bên dưới, nên tổng ở chế độ gộp phải bằng đúng
      // tổng ở chế độ theo mã hàng — một bất biến đáng khẳng định bằng test.
      this.loadBranchTotals(orgId, branchIds, categoryIds, search, columnFilter),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const aggKeys = (aggRows as Array<{ agg_key: string }>)
      .map((r) => r.agg_key)
      .filter(Boolean);
    if (aggKeys.length === 0) return { data: [], branches: [], total, totals };

    // Step 2: fetch per-(agg_key, branch) aggregates for the page
    const cellSql = isParent
      ? `
        SELECT
          ${aggKeyExpr}                                           AS agg_key,
          COALESCE(pr.code, MIN(i.code))                         AS sku,
          COALESCE(pr.name, MIN(i.name))                         AS item_name,
          NULL::text                                             AS parent_sku,
          NULL::text                                             AS parent_name,
          NULL::text                                             AS unit,
          NULL::uuid                                             AS category_id,
          NULL::text                                             AS category_name,
          NULL::text                                             AS brand,
          NULL::text                                             AS color,
          NULL::text                                             AS size,
          b.id                                                   AS branch_id,
          b.name                                                 AS branch_name,
          SUM(sb.quantity)::numeric                               AS qty,
          SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
        FROM stock_balances sb
        JOIN  items i  ON i.id = sb.item_id AND i.organization_id = $1
        LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
        LEFT JOIN branches b  ON b.id::text = sb.branch_id
        WHERE sb.organization_id = $1
          AND ${aggKeyExpr} = ANY($2)
          AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
        GROUP BY ${aggKeyExpr}, pr.code, pr.name, b.id, b.name
        ORDER BY COALESCE(pr.code, MIN(i.code)) ASC NULLS LAST, b.name ASC NULLS LAST
      `
      : `
        SELECT
          i.category_id::text                                    AS agg_key,
          COALESCE(ic.name, 'Không phân nhóm')                   AS sku,
          COALESCE(ic.name, 'Không phân nhóm')                   AS item_name,
          NULL::text                                             AS parent_sku,
          NULL::text                                             AS parent_name,
          NULL::text                                             AS unit,
          i.category_id::text                                    AS category_id,
          COALESCE(ic.name, 'Không phân nhóm')                   AS category_name,
          NULL::text                                             AS brand,
          NULL::text                                             AS color,
          NULL::text                                             AS size,
          b.id                                                   AS branch_id,
          b.name                                                 AS branch_name,
          SUM(sb.quantity)::numeric                               AS qty,
          SUM(sb.quantity * COALESCE(i.purchase_price, 0))::numeric AS value
        FROM stock_balances sb
        JOIN  items i  ON i.id = sb.item_id AND i.organization_id = $1
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        LEFT JOIN branches b  ON b.id::text = sb.branch_id
        WHERE sb.organization_id = $1
          AND i.category_id::text = ANY($2)
          AND ($3::text[] IS NULL OR sb.branch_id = ANY($3::text[]))
        GROUP BY i.category_id, ic.name, b.id, b.name
        ORDER BY COALESCE(ic.name, 'Không phân nhóm') ASC NULLS LAST, b.name ASC NULLS LAST
      `;

    const cellRows = (await this.dataSource.query(cellSql, [
      orgId, aggKeys, branchIds,
    ])) as RawPivotCell[];

    return this.foldCells(cellRows, aggKeys, total, totals);
  }

  // ─── shared fold ─────────────────────────────────────────────────────────────

  private foldCells(
    cellRows: RawPivotCell[],
    orderedKeys: string[],
    total: number,
    totals: ReportTotals,
  ): StockBalancePivotResult {
    const rowByKey = new Map<string, StockBalancePivotRow>();
    const branchById = new Map<string, StockBalancePivotBranchHeader>();

    for (const cell of cellRows) {
      if (!cell.branch_id) continue;

      let row = rowByKey.get(cell.agg_key);
      if (!row) {
        row = {
          itemId: cell.agg_key,
          sku: cell.sku ?? '',
          name: cell.item_name ?? '',
          parentSku: cell.parent_sku ?? null,
          parentName: cell.parent_name ?? null,
          unit: cell.unit ?? '',
          categoryId: cell.category_id ?? null,
          categoryName: cell.category_name ?? null,
          brand: cell.brand ?? null,
          color: cell.color ?? null,
          size: cell.size ?? null,
          totalQty: 0,
          totalValue: 0,
          perBranch: {},
        };
        rowByKey.set(cell.agg_key, row);
      }

      const qty = Number(cell.qty ?? 0);
      const value = Number(cell.value ?? 0);
      row.totalQty += qty;
      row.totalValue += value;
      row.perBranch[cell.branch_id] = {
        branchId: cell.branch_id,
        branchName: cell.branch_name ?? '',
        qty,
        value,
      };

      if (!branchById.has(cell.branch_id)) {
        branchById.set(cell.branch_id, {
          id: cell.branch_id,
          code: null,
          name: cell.branch_name ?? '',
        });
      }
    }

    const data: StockBalancePivotRow[] = [];
    for (const key of orderedKeys) {
      const row = rowByKey.get(key);
      if (row) data.push(row);
    }

    const branches = Array.from(branchById.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'vi'),
    );

    return { data, branches, total, totals };
  }
}

interface RawPivotCell {
  agg_key: string;
  sku: string | null;
  item_name: string | null;
  parent_sku: string | null;
  parent_name: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  branch_id: string | null;
  branch_name: string | null;
  qty: string | number | null;
  value: string | number | null;
}

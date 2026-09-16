import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { BranchService } from '../../branch/branch.service';
import { MediaQueryService } from '../../media/media-query.service';
import {
  MobileInventoryKind,
  MobileInventoryLevel,
  MobileInventorySort,
  MobileInventoryStatus,
} from '../dto/mobile-inventory-product-list.query.dto';
import {
  MobileInventoryProductPageDto,
  MobileInventoryProductResponseDto,
  MobileInventoryStoreResponseDto,
} from '../dto/mobile-inventory.response.dto';
import { cellsSql, monthStartOf, todayIso } from './mobile-inventory-ledger.sql';
import { resolveBranchIds } from './mobile-inventory-scope.util';
import { StorageRow, toStoreCards } from './mobile-inventory-store-card.util';

/** Dòng SQL trước khi gắn ảnh — `imageOwnerId` chỉ dùng nội bộ, không trả về. */
type InventoryProductRow = Omit<MobileInventoryProductResponseDto, 'thumbnailUrl'> & {
  imageOwnerId: string;
};

interface TotalsRow {
  total: number;
  totalQuantity: number;
  totalValue: number;
}

/**
 * Whitelist `ORDER BY` — cùng lập luận với `MobileProductService.ORDER_BY`:
 * chuỗi của client không chạm câu lệnh, và MỌI nhánh kết bằng `id` vì
 * `LIMIT/OFFSET` trên một thứ tự không duy nhất là non-deterministic. Ở đây
 * chuyện đó không phải phòng xa: một kho có hàng chục mặt hàng cùng tồn 0.
 */
const ORDER_BY: Record<MobileInventorySort, string> = {
  [MobileInventorySort.QUANTITY_ASC]: 'quantity ASC, lower(code) ASC, id ASC',
  [MobileInventorySort.QUANTITY_DESC]:
    'quantity DESC, lower(code) ASC, id ASC',
  [MobileInventorySort.VALUE_ASC]: '"stockValue" ASC, lower(code) ASC, id ASC',
  [MobileInventorySort.VALUE_DESC]:
    '"stockValue" DESC, lower(code) ASC, id ASC',
};

/** `out_of_stock` GỒM tồn âm — lý do ở enum. Chuỗi rỗng = không lọc. */
const STATUS_WHERE: Record<MobileInventoryStatus, string> = {
  [MobileInventoryStatus.ALL]: '',
  [MobileInventoryStatus.IN_STOCK]: 'quantity > 0',
  [MobileInventoryStatus.OUT_OF_STOCK]: 'quantity <= 0',
};

/**
 * Biểu thức gộp theo độ mịn. Nhánh `product` MƯỢN đúng biểu thức `code`/`name`
 * của `COMBINED_CTE` (`search-inventory-items-v2.handler.ts`) để mã và tên
 * KHỚP với `/mobile/products` — hai màn cùng nói về một mẫu mã thì phải cùng
 * chữ. Không dùng thẳng `COMBINED_CTE`: nó quét mọi item của tổ chức cộng
 * subquery barcode, trong khi ở đây chỉ cần những item CÓ trong sổ cái.
 *
 * `groupId` của mẫu mã lấy của item đại diện (`MIN(category_id)`) — cùng cách
 * `/mobile/products/:id` lấy nhóm hàng cho phần đầu.
 */
const LEVEL_SQL: Record<
  MobileInventoryLevel,
  {
    key: string;
    /** Chủ sở hữu ảnh: biến thể dùng ảnh của mẫu mã cha, hàng lẻ dùng ảnh của chính nó. */
    imageOwner: string;
    code: string;
    name: string;
    unit: string;
    groupId: string;
    groupBy: string;
  }
> = {
  [MobileInventoryLevel.PRODUCT]: {
    key: 'COALESCE(i.product_id, i.id)::text',
    imageOwner: 'COALESCE(i.product_id, i.id)::text',
    code: 'COALESCE(p.code, p.name, MIN(i.code))',
    name: 'COALESCE(p.name, MIN(i.name))',
    unit: "COALESCE(MIN(i.unit), '')",
    groupId: 'MIN(i.category_id::text)',
    groupBy: 'COALESCE(i.product_id, i.id), p.id, p.code, p.name',
  },
  [MobileInventoryLevel.VARIANT]: {
    key: 'i.id::text',
    imageOwner: 'COALESCE(i.product_id, i.id)::text',
    code: 'i.code',
    name: 'i.name',
    unit: 'i.unit',
    groupId: 'i.category_id::text',
    groupBy: 'i.id, i.product_id, i.code, i.name, i.unit, i.category_id',
  },
};

/**
 * Lọc theo cây nhóm hàng — chép ĐÚNG câu của
 * `StockSummaryService.applyCommonFilters`: item gắn vào nhóm lá nên so bằng
 * với nhóm cha là ra rỗng; `UNION` (không `ALL`) để cây có vòng vẫn dừng.
 * `$1` là organizationId, `${categoryParam}` là tham số của nhóm gốc.
 */
function categoryTreeSql(categoryParam: string): string {
  return `i.category_id IN (
        WITH RECURSIVE category_tree AS (
          SELECT root.id
          FROM inventory_item_categories root
          WHERE root.id = ${categoryParam}
            AND root.organization_id = $1
          UNION
          SELECT child.id
          FROM inventory_item_categories child
          INNER JOIN category_tree parent ON child.parent_group_id = parent.id
        )
        SELECT id FROM category_tree
      )`;
}

/**
 * Báo cáo tồn kho cho app mobile.
 *
 * Tự viết SQL thay vì uỷ quyền cho `StockSummaryService` của web, vì ba lý do
 * cùng lúc: (1) grain của nó cố định item × kho, không gộp được theo mẫu mã
 * hay theo cửa hàng — hai độ mịn mà màn app vẽ; (2) nó không có sắp xếp,
 * trong khi app có bốn tiêu chí và server đang phân trang; (3) nó không được
 * export khỏi `StockLedgerModule`. Thứ mượn được thì mượn nguyên văn (hằng
 * `EXCLUDE_VOIDED_DOCS_SQL`, mệnh đề WHERE, câu cây nhóm hàng) — xem
 * `ledgerCellsSql` ở `mobile-inventory-ledger.sql.ts`, dùng CHUNG với
 * `MobileInventoryDrilldownService` để hai service nhìn cùng một tập bút toán.
 *
 * `@InjectDataSource`: câu lệnh đụng sáu bảng, không entity nào sở hữu nó.
 * Cùng tiền lệ `MobileProductService`.
 *
 * Chi nhánh đi qua QUERY (`branchIds`), không qua header — `@Actor` giải
 * `branchId` theo thứ tự `jwt > header`, mà JWT luôn có, nên header của app
 * không bao giờ thắng. Lý do đầy đủ ở `withBranch` của chứng từ kho.
 */
@Injectable()
export class MobileInventoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly branches: BranchService,
    private readonly mediaQuery: MediaQueryService,
  ) {}

  async listProducts(
    query: {
      page: number;
      limit: number;
      search?: string;
      branchIds?: string[];
      asOf?: string;
      kind: MobileInventoryKind;
      status: MobileInventoryStatus;
      sort: MobileInventorySort;
      level: MobileInventoryLevel;
      unit?: string;
      categoryId?: string;
    },
    actor: ActorContext,
  ): Promise<MobileInventoryProductPageDto> {
    const branchIds = resolveBranchIds(actor, query.branchIds);
    const { page, limit, sort, level } = query;
    const offset = (page - 1) * limit;

    // Tham số đánh số ĐỘNG; `$1` là organizationId vì CTE và câu cây nhóm
    // hàng tham chiếu nó nhiều lần. Viết cứng `$2`/`$3` là lệch tham số ngay
    // khi có `search`, và lệch kiểu đó trả sai dữ liệu chứ không ném lỗi.
    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const asOfParam = bind(query.asOf ?? todayIso());
    const branchesParam = bind(branchIds);

    // Lọc ở tầng ITEM (đơn vị, nhóm hàng) đặt trong CTE `lines`, TRƯỚC khi
    // gộp: đây là thuộc tính của item chứ không phải của dòng đã gộp.
    const itemWhere: string[] = [];
    if (query.unit?.trim()) {
      itemWhere.push(`lower(i.unit) = lower(${bind(query.unit.trim())})`);
    }
    if (query.categoryId) {
      itemWhere.push(categoryTreeSql(bind(query.categoryId)));
    }
    const itemWhereSql = itemWhere.length
      ? `AND ${itemWhere.join(' AND ')}`
      : '';

    // Lọc ở tầng DÒNG (tìm kiếm, trạng thái) đặt SAU khi gộp: "hết hàng" là
    // chuyện của tổng mẫu mã, không phải của từng biến thể.
    const lineWhere: string[] = [];
    if (query.search?.trim()) {
      const searchParam = bind(`%${escapeLikeTerm(query.search.trim())}%`);
      // `COALESCE(...,'')` vì `code`/`name` NULL được ở nhánh mẫu mã — cùng
      // ghi chú ở `MobileProductService.list`.
      lineWhere.push(
        `(COALESCE(code, '') ILIKE ${searchParam} OR COALESCE(name, '') ILIKE ${searchParam})`,
      );
    }
    if (STATUS_WHERE[query.status]) {
      lineWhere.push(STATUS_WHERE[query.status]);
    }
    const lineWhereSql = lineWhere.length
      ? `WHERE ${lineWhere.join(' AND ')}`
      : '';

    const shape = LEVEL_SQL[level];
    const cte = `
      WITH ${cellsSql({ kind: query.kind, asOfParam, branchesParam })},
      lines AS (
        SELECT
          ${shape.key}    AS id,
          ${shape.imageOwner} AS "imageOwnerId",
          ${shape.code}   AS code,
          ${shape.name}   AS name,
          ${shape.unit}   AS unit,
          ${shape.groupId} AS "groupId",
          SUM(c.qty)::float   AS quantity,
          SUM(c.value)::float AS "stockValue"
        FROM cells c
        INNER JOIN items i
                ON i.id = c.item_id AND i.organization_id = $1 AND i.is_active = true
        LEFT  JOIN products p
                ON p.id = i.product_id AND p.organization_id = $1
        WHERE 1 = 1 ${itemWhereSql}
        GROUP BY ${shape.groupBy}
      )`;

    // Chốt tham số của câu tổng TRƯỚC khi thêm `LIMIT`/`OFFSET` — cùng bẫy
    // "bind message supplies N parameters" đã ghi ở `MobileProductService`.
    const totalsParams = [...params];
    const limitParam = bind(limit);
    const offsetParam = bind(offset);

    const dataSql = `
      ${cte}
      SELECT id, code, name, unit, quantity, "stockValue", "groupId", "imageOwnerId"
      FROM lines
      ${lineWhereSql}
      ORDER BY ${ORDER_BY[sort]}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // Câu tổng dùng CÙNG `lineWhereSql`, không phân trang: `total` phải khớp
    // `data`, và hai tổng là của TOÀN tập chứ không phải của trang.
    const totalsSql = `
      ${cte}
      SELECT
        COUNT(*)::int                          AS total,
        COALESCE(SUM(quantity), 0)::float      AS "totalQuantity",
        COALESCE(SUM("stockValue"), 0)::float  AS "totalValue"
      FROM lines
      ${lineWhereSql}
    `;

    const [rows, totalsRows] = await Promise.all([
      this.dataSource.query<InventoryProductRow[]>(dataSql, params),
      this.dataSource.query<TotalsRow[]>(totalsSql, totalsParams),
    ]);
    const totals = totalsRows[0];

    // Ảnh tra MỘT lần cho cả trang — cùng khuôn `MobileProductService.list`.
    const imagesByOwner = await this.mediaQuery.resolvePublicUrls(
      [...new Set(rows.map((row) => row.imageOwnerId))],
      actor.organizationId,
    );
    const data: MobileInventoryProductResponseDto[] = rows.map(
      ({ imageOwnerId, ...row }) => ({
        ...row,
        thumbnailUrl: imagesByOwner.get(imageOwnerId)?.[0]?.url ?? null,
      }),
    );

    return {
      data,
      total: totals?.total ?? 0,
      page,
      limit,
      totalQuantity: totals?.totalQuantity ?? 0,
      totalValue: totals?.totalValue ?? 0,
    };
  }

  /**
   * Thẻ tồn kho của từng cửa hàng — mảng top-level, không phân trang: một
   * người được gán vài cửa hàng, không phải vài trăm (cùng lập luận
   * `/mobile/branches`).
   *
   * Tập cửa hàng lấy từ `BranchService.listMyBranches` (phân công ∩ ACTIVE),
   * đúng tập màn lọc của app đang bày, và giữ nguyên thứ tự của nó. Cửa hàng
   * chưa có bút toán nào vẫn có thẻ với toàn số 0 — nó tồn tại, chỉ là chưa
   * có gì.
   *
   * Một câu SQL đi từ `storages` LEFT JOIN `cells`, nên kho trống vẫn có dòng;
   * gộp theo chi nhánh ở TS vì mỗi dòng SQL là một kho mà thẻ cần cả hai
   * tầng.
   */
  async listStores(
    query: { asOf?: string; kind: MobileInventoryKind; branchIds?: string[] },
    actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto[]> {
    const branchIds = resolveBranchIds(actor, query.branchIds);
    const asOf = query.asOf ?? todayIso();

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const asOfParam = bind(asOf);
    const branchesParam = bind(branchIds);
    const monthStartParam = bind(monthStartOf(asOf));

    // Kho chính đứng đầu rồi tới tên — thứ tự mà thẻ của app liệt kê kho.
    const sql = `
      WITH ${cellsSql({ kind: query.kind, asOfParam, branchesParam, monthStartParam })}
      SELECT
        st.branch_id::text                       AS "branchId",
        st.id::text                              AS id,
        st.name,
        COALESCE(SUM(c.qty), 0)::float           AS quantity,
        COALESCE(SUM(c.value), 0)::float         AS "stockValue",
        COALESCE(SUM(c.period_in), 0)::float     AS "periodIn",
        COALESCE(SUM(c.period_out), 0)::float    AS "periodOut"
      FROM storages st
      LEFT JOIN cells c ON c.storage_id = st.id
      WHERE st.organization_id = $1
        AND st.is_active = true
        AND st.branch_id = ANY(${branchesParam}::uuid[])
      GROUP BY st.branch_id, st.id, st.name, st.is_main_storage
      ORDER BY st.branch_id, st.is_main_storage DESC, lower(st.name), st.id
    `;

    const [rows, branches] = await Promise.all([
      this.dataSource.query<StorageRow[]>(sql, params),
      this.branches.listMyBranches(actor),
    ]);

    // Chi nhánh không có kho nào không có dòng SQL nhưng vẫn phải có thẻ —
    // `keepEmpty`. Phép gộp ở `toStoreCards`, dùng chung với thẻ thu hẹp về
    // một mặt hàng của service drill-down.
    return toStoreCards({ rows, branches, branchIds, keepEmpty: true });
  }

  /**
   * Thẻ của MỘT cửa hàng — cùng SQL với [listStores], thu về một chi nhánh.
   *
   * Ngoài tầm là 403 (qua `resolveBranchIds`); trong tầm nhưng đã ngừng hoạt
   * động là 404 — `listMyBranches` chỉ trả chi nhánh ACTIVE, còn JWT thì
   * không biết chuyện đó.
   */
  async findStore(
    branchId: string,
    query: { asOf?: string; kind: MobileInventoryKind },
    actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto> {
    const [store] = await this.listStores(
      { ...query, branchIds: [branchId] },
      actor,
    );
    if (!store) {
      throw new NotFoundException('Không tìm thấy cửa hàng.');
    }

    return store;
  }
}

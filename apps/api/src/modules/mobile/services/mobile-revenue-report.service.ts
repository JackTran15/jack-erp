import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MediaQueryService } from '../../media/media-query.service';
import { MobileRevenueTimeUnit } from '../dto/mobile-revenue-report.query.dto';
import {
  MobileRevenueBranchDto,
  MobileRevenueCategoryDto,
  MobileRevenueCategoryItemsDto,
  MobileRevenueCategoryListDto,
  MobileRevenueItemBranchesDto,
  MobileRevenueItemDto,
  MobileRevenueItemPageDto,
  MobileRevenueItemVariantsDto,
  MobileRevenueTimelineDto,
  MobileRevenueVariantDto,
} from '../dto/mobile-revenue-report.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';
import {
  revenueLinesSql,
  searchMatchSql,
  SUBJECT_GROUP_BY_SQL,
  SUBJECT_ORDER_BY_SQL,
  SUBJECT_ROW_SQL,
  TIME_BUCKET_SQL,
} from './mobile-revenue-report.sql';
import { fillBuckets } from './mobile-revenue-timeline.util';

/** Kỳ + cửa hàng — phần query mà cả sáu endpoint cùng nhận. */
interface ScopeQuery {
  from: string;
  to: string;
  branchIds?: string[];
}

/**
 * Phạm vi đã giải: mảng tham số đang dựng, hàm bind tiếp, và tên tham số mà
 * `revenueLinesSql` cần.
 */
interface ResolvedScope {
  params: unknown[];
  bind: (value: unknown) => string;
  fromParam: string;
  toParam: string;
  branchesParam: string;
}

/** Dòng mặt hàng trước khi gắn ảnh. */
type ItemRow = Omit<MobileRevenueItemDto, 'thumbnailUrl'>;

interface TotalsRow {
  total: number;
  totalQuantity: number;
  totalRevenue: number;
}

interface CategoryHeaderRow {
  id: string;
  name: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const sumOf = (values: number[]): number =>
  round2(values.reduce((sum, v) => sum + Number(v ?? 0), 0));

/**
 * Báo cáo "Doanh thu theo mặt hàng" cho app mobile — sáu góc nhìn trên CÙNG
 * một tập dòng hoá đơn (`revenueLinesSql`): danh sách mặt hàng, tỉ trọng nhóm
 * hàng, chuỗi thời gian, và ba màn con của một mặt hàng / một nhóm hàng.
 *
 * Không uỷ quyền cho `RevenueByItemReport` của web được: nó là `POST` trả một
 * BẢNG cột động cho đúng một grain mỗi lượt, gộp trong bộ nhớ, và không có
 * chuỗi thời gian theo giờ/thứ hay doanh thu theo chi nhánh của MỘT mặt hàng.
 * Nên chép ĐÚNG công thức + điều kiện lọc của nó vào SQL (ghi ở
 * `mobile-revenue-report.sql.ts`) và gộp bằng `GROUP BY` — sửa điều kiện ở bên
 * kia thì phải sửa cả ở đây.
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG qua `resolveReportBranchScope` — mobile
 * cố ý KHÔNG có vế hợp nhất của web (lý do ở doc util): bộ lọc của app chỉ
 * bày `/mobile/branches`, và số liệu phải cộng trên đúng tập đó.
 *
 * `@InjectDataSource` vì câu lệnh đụng sáu bảng — cùng tiền lệ
 * `MobileInventoryService` và `MobileBusinessReportService`.
 */
@Injectable()
export class MobileRevenueReportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mediaQuery: MediaQueryService,
  ) {}

  /** Trang 1: mặt hàng (mẫu mã) có phát sinh trong kỳ, doanh thu giảm dần, kèm hai tổng toàn tập. */
  async listItems(
    query: ScopeQuery & { page: number; limit: number; search?: string },
    actor: ActorContext,
  ): Promise<MobileRevenueItemPageDto> {
    const scope = await this.resolveScope(query, actor);
    const { page, limit } = query;
    const cte = `WITH ${revenueLinesSql(scope)}`;

    // Ô tìm ở header app. Lọc Ở CÂU NGOÀI, trên CTE `lines` — KHÔNG đụng
    // `revenueLinesSql`, vì sáu endpoint dùng chung nó và chỉ đường này có ô tìm.
    //
    // Ba cột dưới đây ứng ĐÚNG nhánh `parent` của web (`revenue-by-item.report.ts`):
    // `subject_code` ≡ `parentSku ?? itemCode`, `subject_name` ≡ `parentName ?? itemName`,
    // `category_name` ≡ `itemCategory`. `item_code`/`item_name` (biến thể) cố ý
    // KHÔNG có mặt — xem doc của `MobileRevenueItemListQueryDto.search`.
    const term = query.search?.trim();
    const searchWhere = term ? `WHERE ${searchMatchSql(scope.bind(`%${term}%`))}` : '';

    // Chốt tham số của câu tổng TRƯỚC khi thêm `LIMIT`/`OFFSET` — cùng bẫy
    // "bind message supplies N parameters" đã ghi ở `MobileInventoryService`.
    // Tham số của `search` phải bind TRƯỚC dòng này: câu tổng cũng dùng nó.
    const totalsParams = [...scope.params];
    const limitParam = scope.bind(limit);
    const offsetParam = scope.bind((page - 1) * limit);

    const dataSql = `
      ${cte}
      SELECT ${SUBJECT_ROW_SQL}
      FROM lines
      ${searchWhere}
      ${SUBJECT_GROUP_BY_SQL}
      ${SUBJECT_ORDER_BY_SQL}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // Câu tổng không phân trang: `total` phải khớp `data`, và hai tổng là của
    // TOÀN tập chứ không phải của trang. `searchWhere` PHẢI có mặt ở cả hai câu
    // — thiếu ở đây thì thanh Tổng nói về một tập khác các dòng bên dưới, và
    // `total` (nguồn của `hasMore`) đếm trên tập chưa lọc nên cuộn vô tận hỏng.
    const totalsSql = `
      ${cte}
      SELECT
        COUNT(*)::int                          AS total,
        COALESCE(SUM(quantity), 0)::float      AS "totalQuantity",
        COALESCE(SUM(revenue), 0)::float       AS "totalRevenue"
      FROM (SELECT ${SUBJECT_ROW_SQL} FROM lines ${searchWhere} ${SUBJECT_GROUP_BY_SQL}) t
    `;

    const [rows, totalsRows] = await Promise.all([
      this.dataSource.query<ItemRow[]>(dataSql, scope.params),
      this.dataSource.query<TotalsRow[]>(totalsSql, totalsParams),
    ]);
    const totals = totalsRows[0];

    return {
      data: await this.withThumbnails(rows.map(roundItem), actor.organizationId),
      total: totals?.total ?? 0,
      page,
      limit,
      totalQuantity: round2(totals?.totalQuantity ?? 0),
      totalRevenue: round2(totals?.totalRevenue ?? 0),
    };
  }

  /** Trang 2: doanh thu theo nhóm hàng — dòng chưa xếp nhóm BỎ, như web `statBy=group`. */
  async listCategories(
    query: ScopeQuery,
    actor: ActorContext,
  ): Promise<MobileRevenueCategoryListDto> {
    const scope = await this.resolveScope(query, actor);

    const sql = `
      WITH ${revenueLinesSql(scope)}
      SELECT
        category_id::text                 AS id,
        MAX(category_name)                AS name,
        COALESCE(SUM(amount), 0)::float   AS revenue,
        COALESCE(SUM(qty), 0)::float      AS quantity
      FROM lines
      WHERE category_id IS NOT NULL
      GROUP BY category_id
      ORDER BY revenue DESC, name ASC, id ASC
    `;

    const rows = await this.dataSource.query<MobileRevenueCategoryDto[]>(sql, scope.params);
    const data = rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));

    return {
      data,
      totalRevenue: sumOf(data.map((r) => r.revenue)),
      totalQuantity: sumOf(data.map((r) => r.quantity)),
    };
  }

  /** Chế độ theo thời gian: doanh thu gộp theo mốc, đủ mốc của kỳ. */
  async getTimeline(
    query: ScopeQuery & { unit: MobileRevenueTimeUnit },
    actor: ActorContext,
  ): Promise<MobileRevenueTimelineDto> {
    const scope = await this.resolveScope(query, actor);

    const sql = `
      WITH ${revenueLinesSql(scope)}
      SELECT
        ${TIME_BUCKET_SQL[query.unit]}    AS bucket,
        COALESCE(SUM(amount), 0)::float   AS revenue
      FROM lines
      GROUP BY 1
    `;

    const rows = await this.dataSource.query<{ bucket: string; revenue: number }[]>(
      sql,
      scope.params,
    );
    const data = fillBuckets({ unit: query.unit, from: query.from, to: query.to, rows });

    return {
      unit: query.unit,
      // Cộng từ `rows` chứ không từ `data`: ô có khoá ngoài kỳ (nếu có) vẫn
      // là doanh thu của kỳ, chỉ là không có mốc để vẽ.
      totalRevenue: sumOf(rows.map((r) => r.revenue)),
      data,
    };
  }

  /** Màn con: doanh thu của MỘT mặt hàng tách theo chi nhánh. */
  async listBranchesOfItem(
    id: string,
    query: ScopeQuery,
    actor: ActorContext,
  ): Promise<MobileRevenueItemBranchesDto> {
    const header = await this.resolveItemHeader(id, actor.organizationId);
    const scope = await this.resolveScope(query, actor);
    const subjectParam = scope.bind(id);

    // `branches.id` là uuid còn `invoices.branch_id` là varchar → so qua `::text`.
    const sql = `
      WITH ${revenueLinesSql({ ...scope, subjectParam })}
      SELECT
        l.branch_id                         AS id,
        COALESCE(b.name, l.branch_id)       AS name,
        COALESCE(SUM(l.qty), 0)::float      AS quantity,
        COALESCE(SUM(l.amount), 0)::float   AS revenue
      FROM lines l
      LEFT JOIN branches b ON b.id::text = l.branch_id
      GROUP BY l.branch_id, b.name
      ORDER BY revenue DESC, name ASC, id ASC
    `;

    const rows = await this.dataSource.query<MobileRevenueBranchDto[]>(sql, scope.params);
    const data = rows.map((r) => ({
      ...r,
      quantity: round2(r.quantity),
      revenue: round2(r.revenue),
    }));

    return { item: withTotals(header, data), data };
  }

  /** Màn con: doanh thu của MỘT mẫu mã tách theo biến thể (item). */
  async listVariantsOfItem(
    id: string,
    query: ScopeQuery,
    actor: ActorContext,
  ): Promise<MobileRevenueItemVariantsDto> {
    const header = await this.resolveItemHeader(id, actor.organizationId);
    const scope = await this.resolveScope(query, actor);
    const subjectParam = scope.bind(id);

    // Mã/tên là SNAPSHOT trên dòng hoá đơn, như web grain item: biến thể đã
    // bị xoá khỏi catalogue vẫn có tên để hiện.
    const sql = `
      WITH ${revenueLinesSql({ ...scope, subjectParam })}
      SELECT
        item_id::text                     AS id,
        MAX(item_code)                    AS code,
        MAX(item_name)                    AS name,
        COALESCE(SUM(amount), 0)::float   AS revenue
      FROM lines
      GROUP BY item_id
      ORDER BY revenue DESC, code ASC, id ASC
    `;

    const rows = await this.dataSource.query<MobileRevenueVariantDto[]>(sql, scope.params);
    const data = rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));

    // Biến thể không có số lượng, nên tổng số lượng của header đọc từ chính
    // `lines` — cùng câu, để header của hai màn con cùng một mặt hàng khớp nhau.
    const quantitySql = `
      WITH ${revenueLinesSql({ ...scope, subjectParam })}
      SELECT COALESCE(SUM(qty), 0)::float AS quantity FROM lines
    `;
    const [quantityRow] = await this.dataSource.query<{ quantity: number }[]>(
      quantitySql,
      scope.params,
    );

    return {
      item: {
        ...header,
        quantity: round2(quantityRow?.quantity ?? 0),
        revenue: sumOf(data.map((r) => r.revenue)),
      },
      data,
    };
  }

  /** Màn con: doanh thu của MỘT nhóm hàng tách theo mặt hàng (mẫu mã). */
  async listItemsOfCategory(
    id: string,
    query: ScopeQuery,
    actor: ActorContext,
  ): Promise<MobileRevenueCategoryItemsDto> {
    const header = await this.resolveCategoryHeader(id, actor.organizationId);
    const scope = await this.resolveScope(query, actor);
    const categoryParam = scope.bind(id);

    const sql = `
      WITH ${revenueLinesSql({ ...scope, categoryParam })}
      SELECT ${SUBJECT_ROW_SQL}
      FROM lines
      ${SUBJECT_GROUP_BY_SQL}
      ${SUBJECT_ORDER_BY_SQL}
    `;

    const rows = await this.dataSource.query<ItemRow[]>(sql, scope.params);
    const data = await this.withThumbnails(rows.map(roundItem), actor.organizationId);

    return {
      // `quantity` của header cộng từ CHÍNH `data` đang trả, không truy vấn
      // lại: hai con số khác nguồn thì lệch nhau ngay khi một bên đổi bộ lọc.
      category: {
        ...header,
        revenue: sumOf(data.map((r) => r.revenue)),
        quantity: sumOf(data.map((r) => r.quantity)),
      },
      data,
    };
  }

  /**
   * Gắn ảnh bìa, tra MỘT lần cho cả tập — cùng khuôn `MobileProductService.list`.
   * `id` của dòng LÀ chủ sở hữu ảnh: mẫu mã, hoặc item lẻ khi item không thuộc
   * mẫu mã. Kho ảnh chưa cấu hình thì Map rỗng, mọi dòng ra `null`.
   */
  private async withThumbnails(
    rows: ItemRow[],
    organizationId: string,
  ): Promise<MobileRevenueItemDto[]> {
    const imagesByOwner = await this.mediaQuery.resolvePublicUrls(
      rows.map((row) => row.id),
      organizationId,
    );
    return rows.map((row) => ({
      ...row,
      thumbnailUrl: imagesByOwner.get(row.id)?.[0]?.url ?? null,
    }));
  }

  /**
   * Giải phạm vi và mở mảng tham số: `$1` = organizationId (CTE tham chiếu nó
   * nhiều lần), rồi `from`, `to`, rồi mảng chi nhánh CHỈ KHI có mệnh đề —
   * Postgres từ chối tham số mà câu lệnh không tham chiếu.
   */
  private async resolveScope(
    query: ScopeQuery,
    actor: ActorContext,
  ): Promise<ResolvedScope> {
    const branchIds = resolveReportBranchScope({
      requested: query.branchIds,
      actor,
    });

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const fromParam = bind(query.from);
    const toParam = bind(query.to);
    const branchesParam = bind(branchIds);

    return { params, bind, fromParam, toParam, branchesParam };
  }

  /**
   * Tiêu đề của một mặt hàng theo id HỖN HỢP, tra ở CATALOGUE chứ không từ
   * dòng hoá đơn: mặt hàng chưa phát sinh trong kỳ vẫn có tiêu đề (deep
   * link), chỉ danh sách rỗng.
   *
   * Nhánh 2 chỉ nhận item KHÔNG thuộc mẫu mã: item con của một mẫu mã không
   * phải "mặt hàng" ở grain này (dòng của nó gộp vào mẫu mã, lọc theo
   * `subjectParam` sẽ ra 0 dòng), nên trả 404 rõ ràng thay vì một màn rỗng
   * mang tên đúng.
   */
  private async resolveItemHeader(
    id: string,
    organizationId: string,
  ): Promise<Omit<MobileRevenueItemDto, 'quantity' | 'revenue'>> {
    const rows = await this.dataSource.query<
      Omit<MobileRevenueItemDto, 'quantity' | 'revenue' | 'thumbnailUrl'>[]
    >(
      `SELECT p.id::text AS id, COALESCE(p.code, '') AS code, p.name,
              COALESCE((SELECT it.unit FROM items it
                        WHERE it.product_id = p.id
                        ORDER BY it.code ASC, it.id ASC LIMIT 1), '') AS unit
       FROM products p
       WHERE p.organization_id = $1 AND p.id = $2::uuid
       UNION ALL
       SELECT it.id::text, it.code, it.name, it.unit
       FROM items it
       WHERE it.organization_id = $1 AND it.id = $2::uuid AND it.product_id IS NULL
       LIMIT 1`,
      [organizationId, id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy hàng hoá.');

    // Header cùng hình dạng một dòng của trang 1, nên cũng mang ảnh bìa.
    const images = await this.mediaQuery.resolvePublicUrls([row.id], organizationId);
    return { ...row, thumbnailUrl: images.get(row.id)?.[0]?.url ?? null };
  }

  private async resolveCategoryHeader(
    id: string,
    organizationId: string,
  ): Promise<CategoryHeaderRow> {
    const rows = await this.dataSource.query<CategoryHeaderRow[]>(
      `SELECT id::text AS id, name
       FROM inventory_item_categories
       WHERE organization_id = $1 AND id = $2::uuid
       LIMIT 1`,
      [organizationId, id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy nhóm hàng.');
    return row;
  }
}

const roundItem = (r: ItemRow): ItemRow => ({
  ...r,
  quantity: round2(r.quantity),
  revenue: round2(r.revenue),
});

/** Header mặt hàng + hai tổng cộng từ các dòng con, để màn con đọc tổng do server chốt. */
function withTotals(
  header: Omit<MobileRevenueItemDto, 'quantity' | 'revenue'>,
  rows: { quantity: number; revenue: number }[],
): MobileRevenueItemDto {
  return {
    ...header,
    quantity: sumOf(rows.map((r) => r.quantity)),
    revenue: sumOf(rows.map((r) => r.revenue)),
  };
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { BranchService } from '../../branch/branch.service';
import { MediaQueryService } from '../../media/media-query.service';
import {
  documentNumberSql,
  REFERENCE_TYPE_LABELS,
  resolveReferenceLabel,
} from '../../inventory/ledger/stock-ledger-reference.constants';
import {
  MobileInventoryFlowLineDto,
  MobileInventoryFlowResponseDto,
  MobileInventoryFlowSideDto,
  MobileInventoryVariantResponseDto,
} from '../dto/mobile-inventory-drilldown.response.dto';
import { GoodsReceiptPurpose } from '@erp/shared-interfaces';
import {
  MobileInventoryVoucherDocumentDto,
  MobileInventoryVoucherPageDto,
  MobileInventoryVoucherResponseDto,
} from '../dto/mobile-inventory-drilldown.response.dto';
import { MobileInventoryKind } from '../dto/mobile-inventory-product-list.query.dto';
import { MobileStockDocumentKind } from '../dto/mobile-stock-document-list.query.dto';
import { MobileInventoryVoucherSort } from '../dto/mobile-inventory-voucher-list.query.dto';
import { MobileInventoryStoreResponseDto } from '../dto/mobile-inventory.response.dto';
import {
  cellsSql,
  ledgerScopeSql,
  monthStartOf,
  PENDING_LINE_VALUE_SQL,
  pendingScopeSql,
  todayIso,
} from './mobile-inventory-ledger.sql';
import { resolveBranchIds } from './mobile-inventory-scope.util';
import { StorageRow, toStoreCards } from './mobile-inventory-store-card.util';

/** Tập item mà một `:id` hỗn hợp trỏ tới, kèm đơn vị đại diện. */
interface SubjectRow {
  id: string;
  unit: string;
}

interface BalanceRow {
  opening: number;
  closing: number;
}

/** Một loại bút toán trong kỳ, cả hai chiều — TS tách thành hai phía. */
interface FlowTypeRow {
  referenceType: string;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  inCount: number;
  outCount: number;
}

interface VoucherRow {
  referenceType: string;
  referenceId: string | null;
  storageId: string;
  storageName: string;
  code: string;
  qty: number;
  value: number;
  postedAt: Date;
  /** `goods_receipts.purpose` khi là phiếu nhập kho; NULL với mọi loại khác. */
  documentPurpose: string | null;
}

interface VoucherTotalsRow {
  total: number;
  totalQuantity: number;
  totalValue: number;
}

/**
 * Whitelist `ORDER BY` của phiếu. `date` là MỚI NHẤT trước. Mọi nhánh kết
 * bằng `storage_id` rồi `code` — cùng lập luận non-deterministic của
 * `MobileProductService.ORDER_BY`; ở đây hai phiếu cùng thời điểm là chuyện
 * thường (một chứng từ đụng hai kho cho hai dòng cùng `posted_at`).
 */
const VOUCHER_ORDER_BY: Record<MobileInventoryVoucherSort, string> = {
  [MobileInventoryVoucherSort.DATE]:
    'posted_at DESC, storage_id ASC, code ASC',
  [MobileInventoryVoucherSort.QUANTITY_ASC]:
    'ABS(qty) ASC, posted_at DESC, storage_id ASC, code ASC',
  [MobileInventoryVoucherSort.QUANTITY_DESC]:
    'ABS(qty) DESC, posted_at DESC, storage_id ASC, code ASC',
};

/**
 * `CASE reference_type WHEN 'X' THEN 'nhãn' … ELSE reference_type END` — nhãn
 * tiếng Việt của loại chứng từ, nội suy từ hằng BACKEND (không phải input
 * client) để mã phiếu của loại không có bảng chứng từ vẫn đọc được.
 * Nhãn chứa dấu nháy đơn thì nhân đôi theo luật SQL.
 */
const REFERENCE_LABEL_SQL = `CASE g.reference_type ${Object.entries(
  REFERENCE_TYPE_LABELS,
)
  .map(([type, label]) => `WHEN '${type}' THEN '${label.replace(/'/g, "''")}'`)
  .join(' ')} ELSE g.reference_type END`;

/**
 * Chuỗi drill-down của màn Tồn kho: biến thể của một mặt hàng → cửa hàng
 * đang giữ nó → luồng nhập/xuất và phiếu tại một cửa hàng.
 *
 * `:id` của mọi đường là id HỖN HỢP như `/mobile/products`: id mẫu mã hoặc id
 * item — [resolveItemIds] trải nó thành tập item, và mọi câu SQL sau đó chỉ
 * biết tập item. Nhờ vậy màn chi tiết cửa hàng (grain mẫu mã) mở thẳng cấp
 * luồng với id mẫu mã, và sheet biến thể mở cùng cấp đó với id item — một
 * đường, hai độ mịn.
 *
 * Nguồn dữ liệu là CÙNG `ledgerScopeSql`/`cellsSql` với
 * `MobileInventoryService` — đó là thứ giữ tổng biến thể bằng dòng mặt hàng
 * vừa chạm, và tồn cuối kỳ của luồng bằng số trên thẻ cửa hàng.
 *
 * Tách service khỏi `MobileInventoryService` vì cùng lý do
 * `MobileStockDocumentWriteService` tách khỏi service đọc: một file 600 dòng
 * với tám method là một file không ai đọc hết.
 */
@Injectable()
export class MobileInventoryDrilldownService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly branches: BranchService,
    private readonly mediaQuery: MediaQueryService,
  ) {}

  /**
   * Biến thể của `:id` trong kỳ. MỌI item active của mẫu mã đều có dòng —
   * `LEFT JOIN cells` — kể cả biến thể chưa từng phát sinh bút toán: một size
   * tồn 0 là thông tin, và tổng danh sách vẫn bằng dòng mặt hàng vì cộng
   * thêm 0 không đổi gì.
   */
  async listVariants(
    id: string,
    query: { asOf?: string; kind: MobileInventoryKind; branchIds?: string[] },
    actor: ActorContext,
  ): Promise<MobileInventoryVariantResponseDto[]> {
    const branchIds = resolveBranchIds(actor, query.branchIds);
    const subjects = await this.resolveSubjects(id, actor.organizationId);
    const asOf = query.asOf ?? todayIso();

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const asOfParam = bind(asOf);
    const branchesParam = bind(branchIds);
    const itemIdsParam = bind(subjects.map((s) => s.id));
    const monthStartParam = bind(monthStartOf(asOf));

    const sql = `
      WITH ${cellsSql({ kind: query.kind, asOfParam, branchesParam, itemIdsParam, monthStartParam })}
      SELECT
        i.id::text                                 AS id,
        i.code,
        i.name,
        i.unit,
        COALESCE(i.product_id, i.id)::text         AS "imageOwnerId",
        COALESCE(SUM(c.qty), 0)::float             AS quantity,
        COALESCE(SUM(c.value), 0)::float           AS "stockValue",
        COALESCE(SUM(c.opening_qty), 0)::float     AS "openingQuantity",
        COALESCE(SUM(c.period_in), 0)::float       AS "periodIn",
        COALESCE(SUM(c.period_out), 0)::float      AS "periodOut"
      FROM items i
      LEFT JOIN cells c ON c.item_id = i.id
      WHERE i.organization_id = $1
        AND i.id = ANY(${itemIdsParam}::uuid[])
        AND i.is_active = true
      GROUP BY i.id, i.product_id, i.code, i.name, i.unit
      ORDER BY lower(i.code) ASC, i.id ASC
    `;

    const rows = await this.dataSource.query<
      (Omit<MobileInventoryVariantResponseDto, 'thumbnailUrl'> & { imageOwnerId: string })[]
    >(sql, params);

    // Mọi biến thể chung ảnh của mẫu mã cha (A-08) — tra MỘT lần. Hàng lẻ
    // (`:id` là item không có mẫu mã) dùng ảnh của chính nó.
    const imagesByOwner = await this.mediaQuery.resolvePublicUrls(
      [...new Set(rows.map((row) => row.imageOwnerId))],
      actor.organizationId,
    );
    return rows.map(({ imageOwnerId, ...row }) => ({
      ...row,
      thumbnailUrl: imagesByOwner.get(imageOwnerId)?.[0]?.url ?? null,
    }));
  }

  /**
   * Cửa hàng đang giữ `:id` — thẻ cửa hàng thu hẹp về tập item đó.
   *
   * `INNER JOIN cells` chứ không LEFT như thẻ toàn cửa hàng: kho chưa từng có
   * bút toán của mặt hàng này không phải "kho tồn 0" mà là "không liên quan",
   * và chi nhánh không có kho nào như vậy thì không có thẻ — rỗng là câu trả
   * lời "chưa có tồn ở chi nhánh nào".
   */
  async listStoresOf(
    id: string,
    query: { asOf?: string; kind: MobileInventoryKind; branchIds?: string[] },
    actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto[]> {
    const branchIds = resolveBranchIds(actor, query.branchIds);
    const subjects = await this.resolveSubjects(id, actor.organizationId);
    const asOf = query.asOf ?? todayIso();

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const asOfParam = bind(asOf);
    const branchesParam = bind(branchIds);
    const itemIdsParam = bind(subjects.map((s) => s.id));
    const monthStartParam = bind(monthStartOf(asOf));

    const sql = `
      WITH ${cellsSql({ kind: query.kind, asOfParam, branchesParam, itemIdsParam, monthStartParam })}
      SELECT
        st.branch_id::text                       AS "branchId",
        st.id::text                              AS id,
        st.name,
        COALESCE(SUM(c.qty), 0)::float           AS quantity,
        COALESCE(SUM(c.value), 0)::float         AS "stockValue",
        COALESCE(SUM(c.period_in), 0)::float     AS "periodIn",
        COALESCE(SUM(c.period_out), 0)::float    AS "periodOut"
      FROM storages st
      INNER JOIN cells c ON c.storage_id = st.id
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

    return toStoreCards({ rows, branches, branchIds, keepEmpty: false });
  }

  /**
   * Luồng nhập/xuất của `:id` tại một cửa hàng trong kỳ (đầu tháng của
   * `asOf` → `asOf`).
   *
   * Hai câu SQL trên cùng CTE `scoped`: tồn đầu/cuối kỳ, và nhập/xuất theo
   * LOẠI bút toán. `lines` mỗi chiều chỉ gồm loại CÓ bút toán ở chiều đó
   * (`in_count`/`out_count > 0`) — không dựng sẵn một bảng loại cố định, vì
   * sổ cái không có khái niệm "sáu loại" nào; thẻ của app vẽ được danh sách
   * rỗng. Nhãn từ `REFERENCE_TYPE_LABELS`, cùng bảng mà thẻ kho của web dùng.
   *
   * `closingQuantity` = `SUM(quantity)` tới hết `asOf` trên cùng phạm vi với
   * thẻ cửa hàng, nên hai màn liền nhau không bao giờ nói hai con số.
   */
  async getFlow(
    target: { id: string; branchId: string },
    query: { asOf?: string; kind: MobileInventoryKind },
    actor: ActorContext,
  ): Promise<MobileInventoryFlowResponseDto> {
    const branchIds = resolveBranchIds(actor, [target.branchId]);
    const subjects = await this.resolveSubjects(
      target.id,
      actor.organizationId,
    );
    if (query.kind !== MobileInventoryKind.ON_HAND) {
      return this.getPendingFlow({
        kind: query.kind,
        branchId: target.branchId,
        itemIds: subjects.map((s) => s.id),
        actor,
      });
    }
    const asOf = query.asOf ?? todayIso();

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const asOfParam = bind(asOf);
    const branchesParam = bind(branchIds);
    const itemIdsParam = bind(subjects.map((s) => s.id));
    const monthStartParam = bind(monthStartOf(asOf));

    const cte = `
      WITH scoped AS (
        SELECT sle.quantity, sle.line_value, sle.posted_at, sle.reference_type
        ${ledgerScopeSql({ asOfParam, branchesParam, itemIdsParam })}
      )`;

    const balanceSql = `${cte}
      SELECT
        COALESCE(SUM(CASE WHEN posted_at < ${monthStartParam}::date THEN quantity ELSE 0 END), 0)::float AS opening,
        COALESCE(SUM(quantity), 0)::float AS closing
      FROM scoped
    `;

    const typesSql = `${cte}
      SELECT
        reference_type                                          AS "referenceType",
        COALESCE(SUM(GREATEST(quantity, 0)), 0)::float          AS "inQty",
        COALESCE(SUM(GREATEST(line_value, 0)), 0)::float        AS "inValue",
        COALESCE(SUM(GREATEST(-quantity, 0)), 0)::float         AS "outQty",
        COALESCE(SUM(GREATEST(-line_value, 0)), 0)::float       AS "outValue",
        COUNT(*) FILTER (WHERE quantity > 0)::int               AS "inCount",
        COUNT(*) FILTER (WHERE quantity < 0)::int               AS "outCount"
      FROM scoped
      WHERE posted_at >= ${monthStartParam}::date
      GROUP BY reference_type
    `;

    const [balances, types] = await Promise.all([
      this.dataSource.query<BalanceRow[]>(balanceSql, params),
      this.dataSource.query<FlowTypeRow[]>(typesSql, params),
    ]);
    const balance = balances[0];

    return {
      storeId: target.branchId,
      openingQuantity: balance?.opening ?? 0,
      closingQuantity: balance?.closing ?? 0,
      inbound: toFlowSide(
        types
          .filter((t) => t.inCount > 0)
          .map((t) => ({
            name: resolveReferenceLabel(t.referenceType),
            quantity: t.inQty,
            value: t.inValue,
          })),
      ),
      outbound: toFlowSide(
        types
          .filter((t) => t.outCount > 0)
          .map((t) => ({
            name: resolveReferenceLabel(t.referenceType),
            quantity: t.outQty,
            value: t.outValue,
          })),
      ),
    };
  }

  /**
   * Phiếu của `:id` tại một cửa hàng trong kỳ, phân trang, tìm/lọc/sắp ở
   * server.
   *
   * Một phiếu = bút toán gộp theo `(reference_type, reference_id, kho)` —
   * lý do ở `MobileInventoryVoucherResponseDto`. `HAVING SUM <> 0` bỏ nhóm
   * tự triệt tiêu (chuyển vị trí trong cùng kho): không nhập cũng không
   * xuất, không phải một phiếu để bày.
   *
   * Mã phiếu = số chứng từ qua `documentNumberSql` (một index probe mỗi dòng,
   * mượn của thẻ kho web), lùi về nhãn loại khi loại đó không có bảng chứng
   * từ. Tìm kiếm chạy trên `code` ĐÃ giải và tên kho — hai thứ hiện trên một
   * dòng phiếu — nên CTE `vouchers` phải giải mã cho MỌI dòng khớp phạm vi
   * chứ không chỉ trang; chấp nhận vì tập phiếu của một mặt hàng ở một cửa
   * hàng trong một tháng là nhỏ.
   */
  async listVouchers(
    target: { id: string; branchId: string },
    query: {
      page: number;
      limit: number;
      asOf?: string;
      kind: MobileInventoryKind;
      search?: string;
      storageId?: string;
      sort: MobileInventoryVoucherSort;
    },
    actor: ActorContext,
  ): Promise<MobileInventoryVoucherPageDto> {
    const branchIds = resolveBranchIds(actor, [target.branchId]);
    const subjects = await this.resolveSubjects(
      target.id,
      actor.organizationId,
    );
    const asOf = query.asOf ?? todayIso();
    const { page, limit, sort } = query;
    const offset = (page - 1) * limit;

    const params: unknown[] = [actor.organizationId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const asOfParam = bind(asOf);
    const branchesParam = bind(branchIds);
    const itemIdsParam = bind(subjects.map((s) => s.id));
    const monthStartParam = bind(monthStartOf(asOf));

    const where: string[] = [];
    if (query.search?.trim()) {
      const searchParam = bind(`%${escapeLikeTerm(query.search.trim())}%`);
      where.push(
        `(code ILIKE ${searchParam} OR storage_name ILIKE ${searchParam})`,
      );
    }
    if (query.storageId) {
      where.push(`storage_id = ${bind(query.storageId)}::uuid`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Hai nguồn, MỘT hình dạng `vouchers` (cùng tên cột) để `whereSql`,
    // `ORDER BY`, câu tổng và mapper không phải biết nguồn nào.
    const cte =
      query.kind === MobileInventoryKind.ON_HAND
        ? `
      WITH grouped AS (
        SELECT
          sle.reference_type,
          sle.reference_id,
          st.id                                   AS storage_id,
          st.name                                 AS storage_name,
          SUM(sle.quantity)::float                AS qty,
          COALESCE(SUM(sle.line_value), 0)::float AS value,
          MIN(sle.posted_at)                      AS posted_at
        ${ledgerScopeSql({ asOfParam, branchesParam, itemIdsParam })}
          AND sle.posted_at >= ${monthStartParam}::date
        GROUP BY sle.reference_type, sle.reference_id, st.id, st.name
        HAVING SUM(sle.quantity) <> 0
      ),
      vouchers AS (
        SELECT
          g.*,
          COALESCE((${documentNumberSql('g')}), ${REFERENCE_LABEL_SQL}) AS code,
          CASE g.reference_type
            WHEN 'GOODS_RECEIPT' THEN (SELECT d.purpose::text FROM goods_receipts d WHERE d.id = g.reference_id)
            ELSE NULL
          END AS document_purpose
        FROM grouped g
      )`
        : pendingVouchersCte({
            kind: query.kind,
            branchesParam,
            itemIdsParam,
            // Hai tham số đã bind mà nhánh này không đọc — lý do ở
            // `pendingCellsSql.unusedParams`.
            unusedParams: [asOfParam, monthStartParam],
          });

    // Chốt tham số của câu tổng TRƯỚC `LIMIT`/`OFFSET` — cùng bẫy đã ghi ở
    // `MobileProductService`.
    const totalsParams = [...params];
    const limitParam = bind(limit);
    const offsetParam = bind(offset);

    const dataSql = `${cte}
      SELECT
        reference_type   AS "referenceType",
        reference_id::text AS "referenceId",
        storage_id::text AS "storageId",
        storage_name     AS "storageName",
        code,
        qty,
        value,
        posted_at        AS "postedAt",
        document_purpose AS "documentPurpose"
      FROM vouchers
      ${whereSql}
      ORDER BY ${VOUCHER_ORDER_BY[sort]}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const totalsSql = `${cte}
      SELECT
        COUNT(*)::int                        AS total,
        COALESCE(SUM(ABS(qty)), 0)::float    AS "totalQuantity",
        COALESCE(SUM(ABS(value)), 0)::float  AS "totalValue"
      FROM vouchers
      ${whereSql}
    `;

    const [rows, totalsRows] = await Promise.all([
      this.dataSource.query<VoucherRow[]>(dataSql, params),
      this.dataSource.query<VoucherTotalsRow[]>(totalsSql, totalsParams),
    ]);
    const totals = totalsRows[0];
    // Mẫu mã nhiều đơn vị là ca hiếm; lấy của item đầu như phần đầu của
    // `/mobile/products/:id` lấy đơn vị của item đại diện.
    const unit = subjects[0]?.unit ?? '';

    return {
      data: rows.map((row) => toVoucher(row, unit)),
      total: totals?.total ?? 0,
      page,
      limit,
      totalQuantity: totals?.totalQuantity ?? 0,
      totalValue: totals?.totalValue ?? 0,
    };
  }

  /**
   * Luồng của hai loại tồn PENDING: không có kỳ, nên tồn đầu = 0 và tồn cuối =
   * tổng đang chuyển; toàn bộ nằm ở MỘT dòng "Phiếu chuyển kho"
   * (`REFERENCE_TYPE_LABELS.TRANSFER`) ở phía tương ứng — `incoming` là nhập,
   * `in_transit` là xuất. Phía kia rỗng. `closingQuantity` vẫn bằng thẻ cửa
   * hàng cùng `kind` vì cùng `pendingCellsSql`.
   */
  private async getPendingFlow(params: {
    kind: Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>;
    branchId: string;
    itemIds: string[];
    actor: ActorContext;
  }): Promise<MobileInventoryFlowResponseDto> {
    const { kind, branchId, itemIds, actor } = params;

    // Cùng thứ tự bind với mọi đường khác: org, asOf, chi nhánh, item — dù
    // pending không đọc `asOf`.
    const rows = await this.dataSource.query<
      Array<{ quantity: number; value: number }>
    >(
      `WITH ${cellsSql({ kind, asOfParam: '$2', branchesParam: '$3', itemIdsParam: '$4' })}
       SELECT COALESCE(SUM(qty), 0)::float AS quantity, COALESCE(SUM(value), 0)::float AS value
       FROM cells`,
      [actor.organizationId, todayIso(), [branchId], itemIds],
    );
    const total = rows[0] ?? { quantity: 0, value: 0 };
    const lines: MobileInventoryFlowLineDto[] =
      total.quantity === 0
        ? []
        : [
            {
              name: resolveReferenceLabel('TRANSFER'),
              quantity: total.quantity,
              value: total.value,
            },
          ];
    const empty = toFlowSide([]);

    return {
      storeId: branchId,
      openingQuantity: 0,
      closingQuantity: total.quantity,
      inbound:
        kind === MobileInventoryKind.INCOMING ? toFlowSide(lines) : empty,
      outbound:
        kind === MobileInventoryKind.IN_TRANSIT ? toFlowSide(lines) : empty,
    };
  }

  /**
   * Trải `:id` hỗn hợp thành tập item, kèm đơn vị. Cùng cách
   * `MobileProductService.findById` phân biệt mẫu mã với item lẻ, gộp hai
   * nhánh vào một `OR` vì hai khoá không bao giờ trùng nhau (hai bảng, hai
   * uuid). Rỗng = 404, câu KHÔNG nội suy `id` — đi thẳng ra toast của app.
   */
  private async resolveSubjects(
    id: string,
    organizationId: string,
  ): Promise<SubjectRow[]> {
    const rows = await this.dataSource.query<SubjectRow[]>(
      `SELECT i.id::text AS id, i.unit
       FROM items i
       WHERE i.organization_id = $1 AND (i.product_id = $2 OR i.id = $2)
       ORDER BY i.code ASC, i.id ASC`,
      [organizationId, id],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy hàng hoá.');
    }

    return rows;
  }
}

/**
 * CTE `vouchers` cho hai loại tồn PENDING — một dòng mỗi (phiếu chuyển, kho),
 * CÙNG tên cột với nhánh sổ cái. Số lượng mang DẤU theo chiều: `in_transit`
 * là hàng ĐI nên âm (mapper ra `outbound`), `incoming` là hàng VỀ nên dương.
 * Mã = số phiếu, lùi về nhãn loại khi phiếu chưa có số; ngày = lúc xuất kho
 * (`exported_at`), lùi về lúc tạo.
 */
function pendingVouchersCte(params: {
  kind: Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>;
  branchesParam: string;
  itemIdsParam: string;
  unusedParams: string[];
}): string {
  const { unusedParams, ...scope } = params;
  const sign = scope.kind === MobileInventoryKind.IN_TRANSIT ? '-' : '';
  const label = REFERENCE_TYPE_LABELS['TRANSFER'].replace(/'/g, "''");
  const touchUnused = unusedParams
    .map((param) => `
        AND ${param}::text IS NOT NULL`)
    .join('');

  return `
      WITH vouchers AS (
        SELECT
          'TRANSFER'::text                        AS reference_type,
          t.id                                    AS reference_id,
          st.id                                   AS storage_id,
          st.name                                 AS storage_name,
          ${sign}SUM(l.requested_qty)::float           AS qty,
          ${sign}SUM(${PENDING_LINE_VALUE_SQL})::float AS value,
          COALESCE(t.exported_at, t.created_at)   AS posted_at,
          COALESCE(t.document_number, '${label}') AS code,
          NULL::text                              AS document_purpose
        ${pendingScopeSql(scope)}${touchUnused}
        GROUP BY t.id, st.id, st.name, t.document_number, t.exported_at, t.created_at
      )`;
}

/** Một phía của luồng: tổng của các dòng, sắp số lượng giảm dần rồi tên. */
function toFlowSide(
  lines: MobileInventoryFlowLineDto[],
): MobileInventoryFlowSideDto {
  const sorted = [...lines].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name),
  );

  return {
    quantity: sorted.reduce((acc, line) => acc + line.quantity, 0),
    value: sorted.reduce((acc, line) => acc + line.value, 0),
    lines: sorted,
  };
}

/** Chiều theo DẤU của tổng; số lượng và giá trị trả TUYỆT ĐỐI. */
function toVoucher(
  row: VoucherRow,
  unit: string,
): MobileInventoryVoucherResponseDto {
  return {
    id: `${row.referenceType}:${row.referenceId ?? 'none'}:${row.storageId}`,
    direction: row.qty < 0 ? 'outbound' : 'inbound',
    warehouseId: row.storageId,
    warehouseName: row.storageName,
    code: row.code,
    date: new Date(row.postedAt).toISOString(),
    quantity: Math.abs(row.qty),
    unit,
    value: Math.abs(row.value),
    document: documentOf(row),
  };
}

/**
 * Chứng từ app mở được, theo ĐÚNG luật `MobileStockDocumentService.findReceipt`
 * (phiếu nhập `PURCHASE` là `goods-receipt`, purpose khác là `stock-in`; tra
 * sai kind ở đó là 404). Loại không có màn trên app → `null`, kể cả phiếu
 * chuyển đang đi (`reference_type = 'TRANSFER'`).
 */
function documentOf(row: VoucherRow): MobileInventoryVoucherDocumentDto | null {
  const id = row.referenceId;
  if (!id) return null;

  switch (row.referenceType) {
    case 'GOODS_RECEIPT':
      return {
        kind:
          row.documentPurpose === GoodsReceiptPurpose.PURCHASE
            ? MobileStockDocumentKind.GOODS_RECEIPT
            : MobileStockDocumentKind.STOCK_IN,
        id,
      };
    case 'GOODS_ISSUE':
      return { kind: MobileStockDocumentKind.STOCK_OUT, id };
    default:
      return null;
  }
}

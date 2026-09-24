import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
import { SalesOrderEntity } from './entities/sales-order.entity';

/** Một đơn cần đối chiếu; `branchId` vắng = toàn chuỗi (dialog duyệt, A-32). */
export interface StockCheckRequest {
  orderId: string;
  branchId?: string;
}

export interface StockCheckLineResult {
  itemId: string;
  itemCode: string;
  itemName: string;
  /** Tổng SL cần của món trong đơn — các dòng trùng món đã gộp. */
  required: number;
  available: number;
  /** `max(0, required - available)`; `0` = dòng đủ. */
  shortBy: number;
}

export interface StockCheckOrderResult {
  orderId: string;
  orderCode: string;
  /** Chi nhánh đã đối chiếu; `null` = toàn chuỗi. */
  branchId: string | null;
  sufficient: boolean;
  shortLineCount: number;
  lines: StockCheckLineResult[];
}

/**
 * Đối chiếu tồn cho đơn web — MỘT phép tính cho cả ba chỗ dùng (ADR-09): nhận
 * đơn đối tác (toàn chuỗi, trong transaction `createFromPartner`), cảnh báo
 * duyệt (toàn chuỗi) và Validate (chi nhánh đã chọn của từng đơn). Ba con số
 * lệch nhau còn tệ hơn một con số sai, nên đừng viết lại truy vấn này ở chỗ khác.
 *
 * "Tồn" ở đây là tồn THỰC TẾ `SUM(stock_balances.quantity)` — không trừ SL của
 * các đơn đang chờ (A-33), nên hai đơn có thể cùng "đủ" trên cùng một món.
 */
@Injectable()
export class StockAvailabilityService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tồn theo từng `itemId`, toàn chuỗi hoặc một chi nhánh.
   *
   * - `branchId` vắng = toàn chuỗi: mọi vị trí của mọi chi nhánh trong tổ chức.
   * - KHÔNG lọc `is_tracked` và số âm cộng nguyên (A-34) — lọc thêm là số trên
   *   nhãn lệch với màn tồn kho.
   * - Mọi `itemId` được hỏi đều CÓ trong map: món không có dòng balance nào là
   *   `0`, không vắng mặt — bên gọi so `required > available` mà không phải
   *   đoán `undefined` nghĩa là gì.
   * - `manager` có thì chạy bằng nó, để lượt đọc nằm TRONG transaction của bên
   *   gọi (snapshot "Thiếu hàng" lúc nhận đơn); vắng thì dùng `dataSource`.
   *
   * Luôn khoá `organization_id` — `stock_balances` là bảng chung mọi tenant.
   */
  async forItems(
    organizationId: string,
    itemIds: string[],
    branchId?: string,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    const available = new Map<string, number>();
    const ids = [...new Set(itemIds)];
    // `IN ()` rỗng là lỗi cú pháp SQL — không có gì để hỏi thì khỏi chạm DB.
    if (ids.length === 0) return available;
    for (const id of ids) available.set(id, 0);

    const qb = (manager ?? this.dataSource.manager)
      .createQueryBuilder(StockBalanceEntity, 'sb')
      .select('sb.itemId', 'itemId')
      .addSelect('SUM(sb.quantity)', 'total')
      .where('sb.organizationId = :organizationId', { organizationId })
      .andWhere('sb.itemId IN (:...itemIds)', { itemIds: ids })
      .groupBy('sb.itemId');
    // Đi đúng index có sẵn `IDX_stock_balances_org_branch_item` khi có chi nhánh.
    if (branchId) qb.andWhere('sb.branchId = :branchId', { branchId });

    const rows = await qb.getRawMany<{ itemId: string; total: string | number | null }>();
    // `quantity` là numeric nên SUM về dạng CHUỖI — parse một lần mỗi món.
    for (const row of rows) available.set(row.itemId, Number(row.total ?? 0));
    return available;
  }

  /**
   * Đối chiếu đủ/thiếu cho nhiều đơn — phần thân của `POST /admin/sales-orders/stock-check`
   * (ADR-09, Validate: chi nhánh của TỪNG đơn) và `POST /mobile/sales-orders/stock-check`
   * (ADR-12, dialog duyệt ở chi nhánh: tồn của chi nhánh đang thao tác, A-44).
   *
   * - Đơn ngoài tổ chức, hoặc id không tồn tại, bị BỎ QUA im lặng: không lỗi,
   *   không lộ gì về sự tồn tại của nó.
   * - Mỗi đơn gộp SL theo `itemId` trước khi so (dòng trùng món).
   * - `forItems` chạy MỘT lần cho mọi đơn toàn chuỗi và một lần cho mỗi chi nhánh
   *   khác nhau — không phải một lần mỗi đơn.
   * - Kết quả ĐÃ XẾP (A-39): `shortLineCount` tăng dần rồi mã đơn; trong đơn,
   *   dòng đủ trước dòng thiếu, rồi theo mã hàng. Hai dialog không tự xếp lại.
   * - `heldByBranchId` có (đường chi nhánh `POST /mobile/sales-orders/stock-check`,
   *   ADR-12) thì CHỈ nhận đơn đang ở chi nhánh đó (`branch_id = heldByBranchId`);
   *   đơn chi nhánh khác bị bỏ qua im lặng như đơn ngoài tổ chức — không lộ.
   */
  async checkOrders(
    organizationId: string,
    requests: StockCheckRequest[],
    manager?: EntityManager,
    heldByBranchId?: string,
  ): Promise<StockCheckOrderResult[]> {
    // Cùng một đơn hỏi hai lần thì lượt đầu thắng — kết quả khoá theo `orderId`.
    const branchByOrder = new Map<string, string | null>();
    for (const r of requests) {
      if (!branchByOrder.has(r.orderId)) branchByOrder.set(r.orderId, r.branchId ?? null);
    }
    if (branchByOrder.size === 0) return [];

    const em = manager ?? this.dataSource.manager;
    const orders = await em.find(SalesOrderEntity, {
      select: { id: true, documentNumber: true },
      where: {
        id: In([...branchByOrder.keys()]),
        organizationId,
        ...(heldByBranchId ? { branchId: heldByBranchId } : {}),
      },
    });
    if (orders.length === 0) return [];

    const lines = await em.find(SalesOrderLineEntity, {
      select: { salesOrderId: true, itemId: true, itemCode: true, itemName: true, quantity: true },
      where: { salesOrderId: In(orders.map((o) => o.id)) },
    });

    // required[orderId][itemId] — `quantity` numeric về dạng chuỗi.
    const required = new Map<string, Map<string, { itemCode: string; itemName: string; qty: number }>>();
    for (const line of lines) {
      let perItem = required.get(line.salesOrderId);
      if (!perItem) required.set(line.salesOrderId, (perItem = new Map()));
      const agg = perItem.get(line.itemId);
      if (agg) agg.qty += Number(line.quantity);
      else perItem.set(line.itemId, { itemCode: line.itemCode, itemName: line.itemName, qty: Number(line.quantity) });
    }

    // Một lượt `forItems` cho mỗi phạm vi (khoá '' = toàn chuỗi).
    const itemsByScope = new Map<string, string[]>();
    for (const order of orders) {
      const scope = branchByOrder.get(order.id) ?? '';
      const ids = itemsByScope.get(scope) ?? [];
      ids.push(...(required.get(order.id)?.keys() ?? []));
      itemsByScope.set(scope, ids);
    }
    const availableByScope = new Map<string, Map<string, number>>();
    for (const [scope, ids] of itemsByScope) {
      availableByScope.set(scope, await this.forItems(organizationId, ids, scope || undefined, manager));
    }

    const results: StockCheckOrderResult[] = orders.map((order) => {
      const branchId = branchByOrder.get(order.id) ?? null;
      const available = availableByScope.get(branchId ?? '')!;
      const resultLines: StockCheckLineResult[] = [...(required.get(order.id) ?? new Map())].map(
        ([itemId, agg]) => {
          const have = available.get(itemId) ?? 0;
          return {
            itemId,
            itemCode: agg.itemCode,
            itemName: agg.itemName,
            required: agg.qty,
            available: have,
            shortBy: Math.max(0, agg.qty - have),
          };
        },
      );
      resultLines.sort(
        (a, b) => Number(a.shortBy > 0) - Number(b.shortBy > 0) || a.itemCode.localeCompare(b.itemCode),
      );
      const shortLineCount = resultLines.filter((l) => l.shortBy > 0).length;
      return {
        orderId: order.id,
        orderCode: order.documentNumber,
        branchId,
        sufficient: shortLineCount === 0,
        shortLineCount,
        lines: resultLines,
      };
    });

    results.sort((a, b) => a.shortLineCount - b.shortLineCount || a.orderCode.localeCompare(b.orderCode));
    return results;
  }
}

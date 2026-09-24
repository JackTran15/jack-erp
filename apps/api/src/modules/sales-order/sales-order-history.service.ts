import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { BranchEntity } from '../branch/branch.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import {
  SalesOrderDispatchAction,
  SalesOrderDispatchEventEntity,
} from './entities/sales-order-dispatch-event.entity';
import { SalesOrderEntity, SalesOrderStatus } from './entities/sales-order.entity';
import { ORDER_NOT_HELD_BY_BRANCH } from './sales-order.service';

/** Loại mốc trên dòng thời gian của một đơn (§10). */
export enum SalesOrderHistoryKind {
  RECEIVED = 'RECEIVED',
  DISPATCHED = 'DISPATCHED',
  CONFIRMED = 'CONFIRMED',
  RETURNED = 'RETURNED',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Một mốc. Trường vắng = mốc đó không có thông tin ấy. */
export interface SalesOrderHistoryEntry {
  /** ISO 8601 (UTC); client tự định dạng vi-VN. */
  at: string;
  kind: SalesOrderHistoryKind;
  /** Tên người làm; với "Nhận đơn" của đơn web là TÊN KÊNH (A-54). `null` khi không tra được. */
  actorName: string | null;
  /**
   * Chi nhánh liên quan: nhận đơn khi phân, trả đơn khi trả về, duyệt khi duyệt
   * (suy từ lần phân gần nhất trước đó, A-54), đang giữ đơn khi xử lý / từ chối / huỷ.
   */
  branchName?: string;
  /** Chỉ có ở "Phân đơn" từ một chi nhánh khác sang (phân lại). */
  fromBranchName?: string;
  reason?: string;
  /** Chỉ có ở "Thu ngân xử lý". */
  invoiceCode?: string;
  /** Trạng thái hiển thị SAU mốc này — tiếng Việt. */
  statusAfter: string;
}

export interface SalesOrderHistory {
  orderId: string;
  orderCode: string;
  currentStatus: SalesOrderStatus;
  entries: SalesOrderHistoryEntry[];
}

export interface SalesOrderHistoryOptions {
  /** Đường chi nhánh (A-53): chỉ đơn có `branch_id = heldByBranchId`, khác → 403. */
  heldByBranchId?: string;
}

/**
 * Thứ tự vòng đời — khoá phụ khi hai mốc cùng thời điểm (vd. phân và duyệt
 * trong cùng một transaction: `created_at` là giờ bắt đầu transaction).
 */
const LIFECYCLE_RANK: Record<SalesOrderHistoryKind, number> = {
  [SalesOrderHistoryKind.RECEIVED]: 0,
  [SalesOrderHistoryKind.DISPATCHED]: 1,
  [SalesOrderHistoryKind.CONFIRMED]: 2,
  [SalesOrderHistoryKind.RETURNED]: 3,
  [SalesOrderHistoryKind.PROCESSED]: 4,
  [SalesOrderHistoryKind.REJECTED]: 5,
  [SalesOrderHistoryKind.CANCELLED]: 6,
};

const STATUS_AFTER: Record<Exclude<SalesOrderHistoryKind, SalesOrderHistoryKind.RECEIVED>, string> = {
  [SalesOrderHistoryKind.DISPATCHED]: 'Chờ duyệt',
  [SalesOrderHistoryKind.CONFIRMED]: 'Đã duyệt',
  [SalesOrderHistoryKind.RETURNED]: 'Chờ phân',
  [SalesOrderHistoryKind.PROCESSED]: 'Đã xử lý',
  [SalesOrderHistoryKind.REJECTED]: 'Từ chối',
  [SalesOrderHistoryKind.CANCELLED]: 'Đã huỷ',
};

const EVENT_KIND: Record<SalesOrderDispatchAction, SalesOrderHistoryKind> = {
  [SalesOrderDispatchAction.DISPATCH]: SalesOrderHistoryKind.DISPATCHED,
  [SalesOrderDispatchAction.RETURN]: SalesOrderHistoryKind.RETURNED,
  [SalesOrderDispatchAction.CONFIRM]: SalesOrderHistoryKind.CONFIRMED,
};

/** Mốc thô trước khi tra tên — id, chưa phải tên. */
interface RawEntry {
  at: Date;
  kind: SalesOrderHistoryKind;
  actorUserId: string | null;
  /** Tên cố định không cần tra (tên kênh / tên tư vấn viên đã chốt). */
  actorLabel?: string | null;
  branchId?: string | null;
  fromBranchId?: string | null;
  reason?: string | null;
  invoiceId?: string | null;
}

/**
 * Lịch sử một đơn, GHÉP LÚC ĐỌC (ADR-14, A-51): mốc lặp được lấy từ
 * `sales_order_dispatch_events` (DISPATCH / RETURN / CONFIRM), mốc một lần lấy
 * từ cột của đơn (`created_*`, `approved_*` + `invoice_id`, `rejected_*`,
 * `cancelled_*`). Không ghi gì — đơn cũ không có dòng sự kiện nào vẫn có mốc.
 *
 * Số câu truy vấn cố định: đơn, sự kiện, rồi MỘT câu mỗi bảng `users`,
 * `branches`, `invoices` (bỏ câu nào không có id để hỏi).
 */
@Injectable()
export class SalesOrderHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  async timeline(
    orderId: string,
    organizationId: string,
    opts: SalesOrderHistoryOptions = {},
  ): Promise<SalesOrderHistory> {
    const em = this.dataSource.manager;
    const order = await em.findOne(SalesOrderEntity, { where: { id: orderId, organizationId } });
    if (!order) throw new NotFoundException(`Sales order ${orderId} not found`);
    // Kiểm TRƯỚC khi đọc sự kiện: chi nhánh không giữ đơn không được thấy mốc nào (AC-52).
    if (opts.heldByBranchId !== undefined && order.branchId !== opts.heldByBranchId) {
      throw new ForbiddenException({
        code: ORDER_NOT_HELD_BY_BRANCH,
        message: 'Đơn hàng không thuộc chi nhánh đang thao tác',
      });
    }

    const events = await em.find(SalesOrderDispatchEventEntity, {
      where: { organizationId, salesOrderId: orderId },
      order: { createdAt: 'ASC' },
    });

    const isWeb = order.salespersonId == null;
    const raw: RawEntry[] = [
      {
        at: order.createdAt,
        kind: SalesOrderHistoryKind.RECEIVED,
        // Đơn web: người tạo là shadow user của API key — hiện tên kênh (A-54).
        // Đơn mobile: tên tư vấn viên đã chốt trên đơn, thiếu thì tra `users`.
        actorUserId: isWeb ? null : order.createdBy,
        actorLabel: isWeb ? order.salesChannel : order.salespersonName,
        branchId: isWeb ? null : order.branchId,
      },
      ...events.map((ev) => ({
        at: ev.createdAt,
        kind: EVENT_KIND[ev.action],
        actorUserId: ev.actorUserId,
        // Trả về: chi nhánh liên quan là chi nhánh trả. CONFIRM để trống — điền lúc đi dòng thời gian.
        branchId: ev.action === SalesOrderDispatchAction.RETURN ? ev.fromBranchId : ev.toBranchId,
        fromBranchId: ev.action === SalesOrderDispatchAction.DISPATCH ? ev.fromBranchId : null,
        reason: ev.reason,
      })),
    ];
    if (order.approvedAt) {
      raw.push({
        at: order.approvedAt,
        kind: SalesOrderHistoryKind.PROCESSED,
        actorUserId: order.approvedBy,
        branchId: order.branchId,
        invoiceId: order.invoiceId,
      });
    }
    if (order.rejectedAt) {
      raw.push({
        at: order.rejectedAt,
        kind: SalesOrderHistoryKind.REJECTED,
        actorUserId: order.rejectedBy,
        branchId: order.branchId,
        reason: order.rejectReason,
      });
    }
    if (order.cancelledAt) {
      raw.push({
        at: order.cancelledAt,
        kind: SalesOrderHistoryKind.CANCELLED,
        actorUserId: order.cancelledBy,
        branchId: order.branchId,
        reason: order.cancelReason,
      });
    }

    // `sort` ổn định: cùng thời điểm và cùng hạng thì giữ thứ tự `created_at` của bảng sự kiện.
    raw.sort(
      (a, b) => a.at.getTime() - b.at.getTime() || LIFECYCLE_RANK[a.kind] - LIFECYCLE_RANK[b.kind],
    );

    // CONFIRM không lưu chi nhánh (CHECK đòi NULL): lấy `to_branch_id` của lần phân gần nhất trước nó.
    let lastDispatchedTo: string | null = null;
    for (const entry of raw) {
      if (entry.kind === SalesOrderHistoryKind.DISPATCHED) lastDispatchedTo = entry.branchId ?? null;
      if (entry.kind === SalesOrderHistoryKind.CONFIRMED) entry.branchId = lastDispatchedTo;
    }

    const [userNames, branchNames, invoiceCodes] = await Promise.all([
      this.userNamesOf(raw.filter((e) => !e.actorLabel).map((e) => e.actorUserId), organizationId),
      this.branchNamesOf(raw.flatMap((e) => [e.branchId, e.fromBranchId]), organizationId),
      this.invoiceCodesOf(raw.map((e) => e.invoiceId), organizationId),
    ]);

    const receivedStatus =
      order.status === SalesOrderStatus.DRAFT ? 'Nháp' : isWeb ? 'Chờ phân' : 'Chờ xử lý';

    const entries = raw.map((e): SalesOrderHistoryEntry => {
      const entry: SalesOrderHistoryEntry = {
        at: e.at.toISOString(),
        kind: e.kind,
        actorName: e.actorLabel || (e.actorUserId ? userNames.get(e.actorUserId) ?? null : null),
        statusAfter: e.kind === SalesOrderHistoryKind.RECEIVED ? receivedStatus : STATUS_AFTER[e.kind],
      };
      const branchName = e.branchId ? branchNames.get(e.branchId) : undefined;
      if (branchName) entry.branchName = branchName;
      const fromBranchName = e.fromBranchId ? branchNames.get(e.fromBranchId) : undefined;
      if (fromBranchName) entry.fromBranchName = fromBranchName;
      if (e.reason) entry.reason = e.reason;
      const invoiceCode = e.invoiceId ? invoiceCodes.get(e.invoiceId) : undefined;
      if (invoiceCode) entry.invoiceCode = invoiceCode;
      return entry;
    });

    return {
      orderId: order.id,
      orderCode: order.documentNumber,
      currentStatus: order.status,
      entries,
    };
  }

  private async userNamesOf(
    ids: (string | null | undefined)[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const unique = distinct(ids);
    if (!unique.length) return new Map();
    const users = await this.dataSource.manager.find(UserEntity, {
      where: { id: In(unique), organizationId },
      select: ['id', 'firstName', 'lastName'],
    });
    return new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));
  }

  private async branchNamesOf(
    ids: (string | null | undefined)[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const unique = distinct(ids);
    if (!unique.length) return new Map();
    const branches = await this.dataSource.manager.find(BranchEntity, {
      where: { id: In(unique), organizationId },
      select: ['id', 'name'],
    });
    return new Map(branches.map((b) => [b.id, b.name]));
  }

  private async invoiceCodesOf(
    ids: (string | null | undefined)[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const unique = distinct(ids);
    if (!unique.length) return new Map();
    const invoices = await this.dataSource.manager.find(InvoiceEntity, {
      where: { id: In(unique), organizationId },
      select: ['id', 'code'],
    });
    return new Map(invoices.map((inv) => [inv.id, inv.code]));
  }
}

function distinct(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

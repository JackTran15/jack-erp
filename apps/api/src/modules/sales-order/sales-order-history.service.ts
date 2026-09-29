import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { BranchEntity } from '../branch/branch.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import {
  SalesOrderDispatchAction,
  SalesOrderDispatchEventEntity,
} from './entities/sales-order-dispatch-event.entity';
import { DeliveryStatus, SalesOrderEntity, SalesOrderStatus } from './entities/sales-order.entity';
import { ORDER_NOT_HELD_BY_BRANCH } from './sales-order.service';

/** Loại mốc trên dòng thời gian của một đơn (§10). */
export enum SalesOrderHistoryKind {
  RECEIVED = 'RECEIVED',
  DISPATCHED = 'DISPATCHED',
  CONFIRMED = 'CONFIRMED',
  RETURNED = 'RETURNED',
  PROCESSED = 'PROCESSED',
  /** Giao cho đối tác (action `DELIVER`). */
  DELIVERED = 'DELIVERED',
  /** Đổi trạng thái giao (action `DELIVERY_STATUS`); from/to giải từ `reason`. */
  DELIVERY_STATUS_UPDATED = 'DELIVERY_STATUS_UPDATED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Một mốc. Trường vắng = mốc đó không có thông tin ấy. */
export interface SalesOrderHistoryEntry {
  /** ISO 8601 (UTC); client tự định dạng vi-VN. */
  at: string;
  kind: SalesOrderHistoryKind;
  /**
   * Nhãn tiếng Việt của mốc — client lạ hiện nhãn này thay vì mã `kind`. Với
   * "Cập nhật giao hàng" có kèm chuyển trạng thái, vd. "… : Đang giao hàng → Hoàn thành".
   */
  label: string;
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
  [SalesOrderHistoryKind.DELIVERED]: 5,
  [SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED]: 6,
  [SalesOrderHistoryKind.REJECTED]: 7,
  [SalesOrderHistoryKind.CANCELLED]: 8,
};

const KIND_LABEL: Record<SalesOrderHistoryKind, string> = {
  [SalesOrderHistoryKind.RECEIVED]: 'Nhận đơn',
  [SalesOrderHistoryKind.DISPATCHED]: 'Phân đơn',
  [SalesOrderHistoryKind.CONFIRMED]: 'Chi nhánh duyệt',
  [SalesOrderHistoryKind.RETURNED]: 'Trả về pool',
  [SalesOrderHistoryKind.PROCESSED]: 'Thu ngân xử lý',
  [SalesOrderHistoryKind.DELIVERED]: 'Giao hàng',
  [SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED]: 'Cập nhật giao hàng',
  [SalesOrderHistoryKind.REJECTED]: 'Từ chối',
  [SalesOrderHistoryKind.CANCELLED]: 'Huỷ đơn',
};

/** Trạng thái sau mốc — hai kind tính riêng: nhận đơn (theo loại đơn), cập nhật giao (theo `to`). */
const STATUS_AFTER: Record<
  Exclude<SalesOrderHistoryKind, SalesOrderHistoryKind.RECEIVED | SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED>,
  string
> = {
  [SalesOrderHistoryKind.DISPATCHED]: 'Chờ duyệt',
  [SalesOrderHistoryKind.CONFIRMED]: 'Đã duyệt',
  [SalesOrderHistoryKind.RETURNED]: 'Chờ phân',
  [SalesOrderHistoryKind.PROCESSED]: 'Đã xử lý',
  [SalesOrderHistoryKind.DELIVERED]: 'Đang giao hàng',
  [SalesOrderHistoryKind.REJECTED]: 'Từ chối',
  [SalesOrderHistoryKind.CANCELLED]: 'Đã huỷ',
};

/** Nhãn tiếng Việt của trạng thái giao — cùng chữ với lưới Đơn hàng. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  [DeliveryStatus.AWAITING_PICKUP]: 'Chờ giao/lấy hàng',
  [DeliveryStatus.IN_TRANSIT]: 'Đang giao hàng',
  [DeliveryStatus.AWAITING_COD]: 'Chờ thu COD',
  [DeliveryStatus.COMPLETED]: 'Hoàn thành',
  [DeliveryStatus.FAILED]: 'Thất bại',
  [DeliveryStatus.RETURNED]: 'Đã chuyển hoàn',
};

const EVENT_KIND: Record<SalesOrderDispatchAction, SalesOrderHistoryKind> = {
  [SalesOrderDispatchAction.DISPATCH]: SalesOrderHistoryKind.DISPATCHED,
  [SalesOrderDispatchAction.RETURN]: SalesOrderHistoryKind.RETURNED,
  [SalesOrderDispatchAction.CONFIRM]: SalesOrderHistoryKind.CONFIRMED,
  [SalesOrderDispatchAction.PROCESS]: SalesOrderHistoryKind.PROCESSED,
  [SalesOrderDispatchAction.DELIVER]: SalesOrderHistoryKind.DELIVERED,
  [SalesOrderDispatchAction.DELIVERY_STATUS]: SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED,
};

/** Tách phần chuyển trạng thái khỏi lý do tự do trong `reason` của `DELIVERY_STATUS`. */
const DELIVERY_REASON_SEPARATOR = ': ';
const DELIVERY_TRANSITION_ARROW = '->';

export interface DecodedDeliveryStatusReason {
  from: DeliveryStatus;
  to: DeliveryStatus;
  /** Lý do tự do người dùng nhập; `null` khi không có. */
  reason: string | null;
}

/**
 * Ghi `reason` của event `DELIVERY_STATUS` (ADR-06): `FROM->TO` hoặc
 * `FROM->TO: lý do`. Lý do có thể chứa `": "` — giải mã chỉ cắt ở lần đầu.
 */
export function encodeDeliveryStatusReason(
  from: DeliveryStatus,
  to: DeliveryStatus,
  reason?: string | null,
): string {
  const transition = `${from}${DELIVERY_TRANSITION_ARROW}${to}`;
  const note = reason?.trim();
  return note ? `${transition}${DELIVERY_REASON_SEPARATOR}${note}` : transition;
}

/** Ngược của {@link encodeDeliveryStatusReason}; chuỗi không đúng khuôn → `null`. */
export function decodeDeliveryStatusReason(
  raw: string | null | undefined,
): DecodedDeliveryStatusReason | null {
  if (!raw) return null;
  const cut = raw.indexOf(DELIVERY_REASON_SEPARATOR);
  const transition = cut === -1 ? raw : raw.slice(0, cut);
  const note = cut === -1 ? '' : raw.slice(cut + DELIVERY_REASON_SEPARATOR.length);
  const parts = transition.split(DELIVERY_TRANSITION_ARROW);
  if (parts.length !== 2 || !isDeliveryStatus(parts[0]) || !isDeliveryStatus(parts[1])) return null;
  return { from: parts[0], to: parts[1], reason: note || null };
}

function isDeliveryStatus(value: string): value is DeliveryStatus {
  return (Object.values(DeliveryStatus) as string[]).includes(value);
}

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
  /** Chỉ `DELIVERY_STATUS_UPDATED`: from/to giải từ `reason` của event. */
  delivery?: DecodedDeliveryStatusReason | null;
}

/**
 * Lịch sử một đơn, GHÉP LÚC ĐỌC (ADR-14, A-51): mốc lặp được lấy từ
 * `sales_order_dispatch_events` (DISPATCH / RETURN / CONFIRM / PROCESS / DELIVER /
 * DELIVERY_STATUS), mốc một lần lấy từ cột của đơn (`created_*`, `approved_*` +
 * `invoice_id` — chỉ khi không có event PROCESS, `rejected_*`, `cancelled_*`). Không ghi gì — đơn cũ không có dòng sự kiện nào vẫn có mốc.
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
      ...events.map((ev): RawEntry => {
        if (ev.action === SalesOrderDispatchAction.PROCESS) {
          // Event không lưu chi nhánh / hoá đơn: lấy từ đơn, như mốc `approved_at` cũ.
          return {
            at: ev.createdAt,
            kind: SalesOrderHistoryKind.PROCESSED,
            actorUserId: ev.actorUserId,
            branchId: order.branchId,
            invoiceId: order.invoiceId,
          };
        }
        if (ev.action === SalesOrderDispatchAction.DELIVERY_STATUS) {
          const delivery = decodeDeliveryStatusReason(ev.reason);
          return {
            at: ev.createdAt,
            kind: SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED,
            actorUserId: ev.actorUserId,
            // Không giải được thì giữ nguyên chuỗi thô làm lý do, không nuốt mất.
            reason: delivery ? delivery.reason : ev.reason,
            delivery,
          };
        }
        return {
          at: ev.createdAt,
          kind: EVENT_KIND[ev.action],
          actorUserId: ev.actorUserId,
          // Trả về: chi nhánh liên quan là chi nhánh trả. CONFIRM để trống — điền lúc đi dòng thời gian.
          branchId: ev.action === SalesOrderDispatchAction.RETURN ? ev.fromBranchId : ev.toBranchId,
          fromBranchId: ev.action === SalesOrderDispatchAction.DISPATCH ? ev.fromBranchId : null,
          reason: ev.reason,
        };
      }),
    ];
    // Có event PROCESS thì mốc xử lý đã có — không ghép thêm từ `approved_at` (đơn cũ không có event).
    const hasProcessEvent = events.some((ev) => ev.action === SalesOrderDispatchAction.PROCESS);
    if (order.approvedAt && !hasProcessEvent) {
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
        label: labelOf(e),
        actorName: e.actorLabel || (e.actorUserId ? userNames.get(e.actorUserId) ?? null : null),
        statusAfter: statusAfterOf(e, receivedStatus),
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

function labelOf(e: RawEntry): string {
  if (e.kind === SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED && e.delivery) {
    const { from, to } = e.delivery;
    return `${KIND_LABEL[e.kind]}: ${DELIVERY_STATUS_LABELS[from]} → ${DELIVERY_STATUS_LABELS[to]}`;
  }
  return KIND_LABEL[e.kind];
}

function statusAfterOf(e: RawEntry, receivedStatus: string): string {
  if (e.kind === SalesOrderHistoryKind.RECEIVED) return receivedStatus;
  if (e.kind === SalesOrderHistoryKind.DELIVERY_STATUS_UPDATED) {
    return e.delivery ? DELIVERY_STATUS_LABELS[e.delivery.to] : KIND_LABEL[e.kind];
  }
  return STATUS_AFTER[e.kind];
}

function distinct(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

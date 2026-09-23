import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
} from '../../pos/entities/invoice.entity';
import { SalesOrderStatus } from '../../sales-order/entities/sales-order.entity';
import { MobileInventoryKind } from '../dto/mobile-inventory-product-list.query.dto';
import {
  MobilePaymentSplitDto,
  MobileStoreDetailResponseDto,
  MobileStoreNewCustomerDto,
} from '../dto/mobile-store-detail.response.dto';
import { MobileInventoryService } from './mobile-inventory.service';
import { resolveReportBranchScope } from './mobile-report-scope.util';
import { revenueLinesSql } from './mobile-revenue-report.sql';

/**
 * Sheet "Khách hàng mới" của app không phân trang (một danh sách cuộn trong
 * bottom sheet), nên server chốt trần ở đây. `count`/`totalAmount` vẫn là của
 * TOÀN tập — 20 chỉ là số dòng mang về.
 */
const NEW_CUSTOMER_LIMIT = 20;

interface DateRange {
  from: string;
  to: string;
}

interface RevenueRow {
  total: number;
  paidAmount: number;
  paidCount: number;
  unpaidAmount: number;
  unpaidCount: number;
  invoiceCount: number;
}

interface CountRow {
  count: number;
}

export interface PaymentRow {
  method: string;
  amount: number;
}

interface NewCustomerTotalsRow {
  count: number;
  totalAmount: number;
}

const round2 = (n: number): number => Math.round(Number(n ?? 0) * 100) / 100;

/**
 * Chi tiết MỘT cửa hàng trong kỳ — `GET /mobile/reports/overview/branches/:id`.
 *
 * Mọi con số TIỀN BÁN HÀNG dựng trên cùng CTE `revenueLinesSql` của Tổng quan
 * và Doanh thu theo mặt hàng (loại huỷ, dấu theo `direction`, trừ KM engine),
 * nên `revenue.total` ở đây BẰNG dòng chi nhánh ở Tổng quan cùng kỳ. Tách
 * đã/chưa thanh toán theo `invoices.status` (`paid` / `debt`+`partial_debt`)
 * — hai nhóm này phủ kín tập dòng (huỷ đã bị loại, nháp/pending không có
 * `issued_at`), nên `paidAmount + unpaidAmount = total`.
 *
 * Tiền THU thì khác doanh thu và đọc từ bảng thanh toán: `invoice_payments`
 * (dấu −1 cho hoá đơn RETURN, chép `invoiceTypeSign` của POS daily summary
 * web) và `debt_payments` (thu nợ sau bán, theo `paid_at`). Lọc org/chi nhánh
 * qua `invoices` chứ KHÔNG qua cột của `invoice_payments`: cột đó là uuid,
 * so với `actor.organizationId` (chuỗi) là 500 — bẫy kiểu đã ghi ở
 * `mobile-inventory-ledger.sql.ts`.
 *
 * Khách mới = khách TẠO tại cửa hàng trong kỳ (`customers.created_at`,
 * `branch_id` = chi nhánh active lúc tạo, bỏ `MERGED`); tiền mỗi khách là
 * doanh thu của họ tại cửa hàng trong kỳ. Web chưa có công thức nào cho khái
 * niệm này — định nghĩa chốt với người dùng 2026-09-12.
 *
 * "Chờ thanh toán" là TRẠNG THÁI HIỆN TẠI (mọi hoá đơn còn nợ của cửa hàng),
 * cố ý KHÔNG lọc theo kỳ — cũng chốt cùng ngày.
 *
 * Tồn kho uỷ quyền `MobileInventoryService.findStore` (giá trị tồn + tổng số
 * lượng), để thẻ ở màn này và trang tồn kho cửa hàng luôn cùng số.
 */
@Injectable()
export class MobileStoreDetailService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: MobileInventoryService,
  ) {}

  async getDetail(
    query: DateRange & { id: string },
    actor: ActorContext,
  ): Promise<MobileStoreDetailResponseDto> {
    const [branchId] = resolveReportBranchScope({
      requested: [query.id],
      actor,
    });
    const org = actor.organizationId;
    const name = await this.queryName(org, branchId);

    const params: unknown[] = [org, query.from, query.to, [branchId]];
    const lines = revenueLinesSql({
      fromParam: '$2',
      toParam: '$3',
      branchesParam: '$4',
    });

    const [
      [revenue],
      [cancelled],
      salesPayments,
      debtPayments,
      [pending],
      [pendingOrder],
      newCustomerItems,
      [newCustomerTotals],
      inventory,
    ] = await Promise.all([
      this.dataSource.query<RevenueRow[]>(revenueSql(lines), params),
      this.dataSource.query<CountRow[]>(CANCELLED_SQL, params),
      this.dataSource.query<PaymentRow[]>(SALES_PAYMENTS_SQL, params),
      this.dataSource.query<PaymentRow[]>(DEBT_PAYMENTS_SQL, params),
      this.dataSource.query<CountRow[]>(PENDING_UNPAID_SQL, [org, [branchId]]),
      this.dataSource.query<CountRow[]>(PENDING_ORDER_SQL, [org, [branchId]]),
      this.dataSource.query<MobileStoreNewCustomerDto[]>(
        newCustomerItemsSql(lines),
        [...params, NEW_CUSTOMER_LIMIT],
      ),
      this.dataSource.query<NewCustomerTotalsRow[]>(
        newCustomerTotalsSql(lines),
        params,
      ),
      this.inventory.findStore(
        branchId,
        { kind: MobileInventoryKind.ON_HAND },
        actor,
      ),
    ]);

    return {
      id: branchId,
      name,
      revenue: {
        total: round2(revenue?.total ?? 0),
        paidAmount: round2(revenue?.paidAmount ?? 0),
        paidCount: Number(revenue?.paidCount ?? 0),
        unpaidAmount: round2(revenue?.unpaidAmount ?? 0),
        unpaidCount: Number(revenue?.unpaidCount ?? 0),
        cancelledCount: Number(cancelled?.count ?? 0),
        invoiceCount: Number(revenue?.invoiceCount ?? 0),
      },
      collected: {
        sales: splitOf(salesPayments),
        debt: splitOf(debtPayments),
      },
      pendingUnpaidCount: Number(pending?.count ?? 0),
      pendingOrderCount: Number(pendingOrder?.count ?? 0),
      newCustomers: {
        count: Number(newCustomerTotals?.count ?? 0),
        totalAmount: round2(newCustomerTotals?.totalAmount ?? 0),
        items: newCustomerItems.map((c) => ({
          id: c.id,
          code: c.code ?? null,
          name: c.name,
          createdAt: c.createdAt,
          amount: round2(c.amount),
        })),
      },
      inventory: {
        quantity: inventory.quantity,
        stockValue: inventory.stockValue,
      },
    };
  }

  /** Tên chi nhánh; không có trong tổ chức → 404 tiếng Việt, không nội suy id. */
  private async queryName(
    organizationId: string,
    branchId: string,
  ): Promise<string> {
    const rows = await this.dataSource.query<{ name: string }[]>(
      `SELECT name FROM branches WHERE organization_id = $1 AND id = $2::uuid`,
      [organizationId, branchId],
    );
    const name = rows[0]?.name;
    if (!name) throw new NotFoundException('Không tìm thấy chi nhánh.');
    return name;
  }
}

/** Doanh thu tách theo trạng thái thanh toán — trên CTE `lines`. */
export function revenueSql(lines: string): string {
  return `
    WITH ${lines}
    SELECT
      COALESCE(SUM(amount), 0)::float                                           AS total,
      COALESCE(SUM(amount) FILTER (WHERE invoice_status = '${InvoiceStatus.PAID}'), 0)::float
                                                                                AS "paidAmount",
      COUNT(DISTINCT invoice_id) FILTER (WHERE invoice_status = '${InvoiceStatus.PAID}')::int
                                                                                AS "paidCount",
      COALESCE(SUM(amount) FILTER (WHERE invoice_status IN ('${InvoiceStatus.DEBT}', '${InvoiceStatus.PARTIAL_DEBT}')), 0)::float
                                                                                AS "unpaidAmount",
      COUNT(DISTINCT invoice_id) FILTER (WHERE invoice_status IN ('${InvoiceStatus.DEBT}', '${InvoiceStatus.PARTIAL_DEBT}'))::int
                                                                                AS "unpaidCount",
      COUNT(DISTINCT invoice_id)::int                                           AS "invoiceCount"
    FROM lines
  `;
}

/** Hoá đơn HUỶ trong kỳ — CTE đã loại chúng nên phải đếm thẳng trên `invoices`. */
const CANCELLED_SQL = `
  SELECT COUNT(*)::int AS count
  FROM invoices i
  WHERE i.organization_id = $1
    AND i.branch_id = ANY($4::text[])
    AND i.is_draft = false
    AND i.status = '${InvoiceStatus.CANCELLED}'
    AND i.issued_at >= $2::date
    AND i.issued_at < ($3::date + INTERVAL '1 day')
`;

/**
 * Thanh toán trên hoá đơn trong kỳ, theo phương thức. Hoá đơn RETURN là tiền
 * TRẢ khách nên mang dấu âm; EXCHANGE giữ dấu dương (khách bù thêm) — chép
 * `invoiceTypeSign` của web. Lọc org/chi nhánh qua `invoices` (xem doc class).
 */
export const SALES_PAYMENTS_SQL = `
  SELECT
    p.payment_method::text AS method,
    COALESCE(SUM(p.amount * CASE WHEN i.type = '${InvoiceType.RETURN}' THEN -1 ELSE 1 END), 0)::float AS amount
  FROM invoice_payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE i.organization_id = $1
    AND i.branch_id = ANY($4::text[])
    AND i.is_draft = false
    AND i.status <> '${InvoiceStatus.CANCELLED}'
    AND i.issued_at >= $2::date
    AND i.issued_at < ($3::date + INTERVAL '1 day')
  GROUP BY p.payment_method
`;

/** Thu nợ sau bán trong kỳ, theo phương thức — mốc là `paid_at`, không phải ngày hoá đơn. */
export const DEBT_PAYMENTS_SQL = `
  SELECT
    d.payment_method::text AS method,
    COALESCE(SUM(d.amount), 0)::float AS amount
  FROM debt_payments d
  WHERE d.organization_id = $1
    AND d.branch_id = ANY($4::text[])
    AND d.paid_at >= $2::date
    AND d.paid_at < ($3::date + INTERVAL '1 day')
  GROUP BY d.payment_method
`;

/** Hoá đơn còn nợ HIỆN TẠI — cố ý không có mệnh đề ngày. */
const PENDING_UNPAID_SQL = `
  SELECT COUNT(*)::int AS count
  FROM invoices i
  WHERE i.organization_id = $1
    AND i.branch_id = ANY($2::text[])
    AND i.is_draft = false
    AND i.status IN ('${InvoiceStatus.DEBT}', '${InvoiceStatus.PARTIAL_DEBT}')
`;

/**
 * Đơn hàng đang CHỜ XỬ LÝ — cũng không có mệnh đề ngày, cùng lý do
 * {@link PENDING_UNPAID_SQL}: đây là việc còn tồn, không phải việc của một kỳ.
 *
 * Chỉ đếm `SENT`. `PROCESSED` mà hoá đơn còn nháp là "hộp thư thu ngân"
 * (`awaitingCashier` của `/mobile/sales-orders`), một câu hỏi khác — người quản
 * lý hỏi "còn bao nhiêu đơn chưa ai nhận", không hỏi "thu ngân còn dở mấy đơn".
 */
const PENDING_ORDER_SQL = `
  SELECT COUNT(*)::int AS count
  FROM sales_orders so
  WHERE so.organization_id = $1
    AND so.branch_id = ANY($2::text[])
    AND so.status = '${SalesOrderStatus.SENT}'
`;

/** CTE khách tạo tại cửa hàng trong kỳ — dùng chung cho hai câu dưới. */
const FRESH_CUSTOMERS_CTE = `fresh AS (
    SELECT c.id, c.code, c.name, c.created_at
    FROM customers c
    WHERE c.organization_id = $1
      AND c.branch_id = ANY($4::text[])
      AND c.status <> '${CustomerStatus.MERGED}'
      AND c.created_at >= $2::date
      AND c.created_at < ($3::date + INTERVAL '1 day')
  )`;

/** Khách mới nhất trước, kèm doanh thu của họ trong kỳ; `$5` là trần số dòng. */
function newCustomerItemsSql(lines: string): string {
  return `
    WITH ${lines},
    ${FRESH_CUSTOMERS_CTE}
    SELECT
      f.id::text                          AS id,
      f.code                              AS code,
      f.name                              AS name,
      f.created_at                        AS "createdAt",
      COALESCE(SUM(l.amount), 0)::float   AS amount
    FROM fresh f
    LEFT JOIN lines l ON l.customer_id = f.id
    GROUP BY f.id, f.code, f.name, f.created_at
    ORDER BY f.created_at DESC, f.id ASC
    LIMIT $5
  `;
}

/** Tổng của TOÀN tập khách mới — `COUNT(DISTINCT)` vì join dòng hoá đơn nhân bản khách. */
function newCustomerTotalsSql(lines: string): string {
  return `
    WITH ${lines},
    ${FRESH_CUSTOMERS_CTE}
    SELECT
      COUNT(DISTINCT f.id)::int           AS count,
      COALESCE(SUM(l.amount), 0)::float   AS "totalAmount"
    FROM fresh f
    LEFT JOIN lines l ON l.customer_id = f.id
  `;
}

/**
 * Gộp các dòng `(method, amount)` về ba ô. Phương thức lạ (enum mở rộng sau
 * này) bị BỎ QUA chứ không ném: tổng thiếu một ô còn hơn màn hình trắng.
 */
export function splitOf(rows: PaymentRow[]): MobilePaymentSplitDto {
  const split: MobilePaymentSplitDto = { cash: 0, card: 0, transfer: 0 };
  for (const row of rows) {
    const amount = round2(row.amount);
    switch (row.method) {
      case InvoicePaymentMethod.CASH:
        split.cash = round2(split.cash + amount);
        break;
      case InvoicePaymentMethod.CARD:
        split.card = round2(split.card + amount);
        break;
      case InvoicePaymentMethod.BANK_TRANSFER:
        split.transfer = round2(split.transfer + amount);
        break;
      default:
        break;
    }
  }
  return split;
}

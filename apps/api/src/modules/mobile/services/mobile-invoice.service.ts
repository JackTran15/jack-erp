import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import {
  InvoiceStatus,
  InvoiceType,
} from '../../pos/entities/invoice.entity';
import { InvoiceService } from '../../pos/services/invoice.service';
import {
  MobileInvoiceDateBasis,
  MobileInvoiceOrder,
  MobileInvoiceStatus,
} from '../dto/mobile-invoice-list.query.dto';
import {
  MobileInvoiceDetailResponseDto,
  MobileInvoiceLineDto,
  MobileInvoicePageDto,
  MobileInvoiceResponseDto,
} from '../dto/mobile-invoice.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';

/** Một dòng của câu đếm — tổng số và tổng tiền (có dấu) của toàn tập khớp. */
interface CountRow {
  total: number;
  totalAmount: number;
}

/** Một dòng của câu tra tên nhân viên bán. */
interface NameRow {
  name: string | null;
}

/**
 * Trạng thái backend -> ba trạng thái của app.
 *
 * `draft` và `pending` KHÔNG có mặt, cố ý: chúng chưa ghi sổ, và app không có
 * màn nào cho một hoá đơn đang lập dở ở quầy. Tập khoá của bảng này cũng là
 * tập `status IN (...)` mặc định của mọi câu lệnh bên dưới — thêm một trạng
 * thái vào đây là nó tự xuất hiện ở danh sách.
 */
const STATUS_OF: Partial<Record<InvoiceStatus, MobileInvoiceStatus>> = {
  [InvoiceStatus.PAID]: MobileInvoiceStatus.PAID,
  [InvoiceStatus.DEBT]: MobileInvoiceStatus.UNPAID,
  [InvoiceStatus.PARTIAL_DEBT]: MobileInvoiceStatus.UNPAID,
  [InvoiceStatus.CANCELLED]: MobileInvoiceStatus.CANCELLED,
};

/** Chiều ngược của [STATUS_OF]: một trạng thái app -> các giá trị cột. */
const STATUS_COLUMN_VALUES: Record<MobileInvoiceStatus, InvoiceStatus[]> = {
  [MobileInvoiceStatus.PAID]: [InvoiceStatus.PAID],
  [MobileInvoiceStatus.UNPAID]: [InvoiceStatus.DEBT, InvoiceStatus.PARTIAL_DEBT],
  [MobileInvoiceStatus.CANCELLED]: [InvoiceStatus.CANCELLED],
};

/** Mọi giá trị cột mà app nhìn thấy — chính là tập khoá của [STATUS_OF]. */
const VISIBLE_STATUSES = Object.keys(STATUS_OF) as InvoiceStatus[];

const TYPE_OF: Record<InvoiceType, MobileInvoiceResponseDto['type']> = {
  [InvoiceType.SALE]: 'sale',
  [InvoiceType.RETURN]: 'return',
  [InvoiceType.EXCHANGE]: 'exchange',
};

/**
 * Cột thời gian theo `dateBasis`. Bảng tra trên enum, KHÔNG nội suy chuỗi
 * của client — cùng hàng rào với `ORDER_BY` của `MobileCustomerService`.
 */
const DATE_COLUMN: Record<MobileInvoiceDateBasis, string> = {
  [MobileInvoiceDateBasis.CREATED]: 'i.created_at',
  [MobileInvoiceDateBasis.ISSUED]: 'i.issued_at',
};

const ORDER_DIRECTION: Record<MobileInvoiceOrder, 'ASC' | 'DESC'> = {
  [MobileInvoiceOrder.ASC]: 'ASC',
  [MobileInvoiceOrder.DESC]: 'DESC',
};

/**
 * "Tổng thanh toán" có dấu — cùng định nghĩa với `invoiceSignedTotalSql` của
 * web (viết lại bằng tên CỘT vì ở đây là SQL thô, bên đó là alias TypeORM):
 * hoá đơn bán lấy `amount_due`, trả/đổi hàng lấy `net_amount` (âm khi hoàn
 * tiền cho khách).
 */
const SIGNED_AMOUNT_SQL = `
  CASE WHEN i.type IN ('RETURN', 'EXCHANGE') THEN i.net_amount ELSE i.amount_due END
`;

/**
 * Cột trả về cho một dòng danh sách. `::float` cho tiền, `to_char` KHÔNG dùng
 * cho timestamptz — driver trả `Date`, JSON hoá thành ISO-8601 có múi giờ,
 * đúng thứ `DateTime.tryParse` phía Dart đọc được.
 */
const SELECT_ROW = `
  SELECT
    i.id,
    i.code,
    i.type,
    i.status,
    i.created_at                     AS "createdAt",
    i.issued_at                      AS "issuedAt",
    (${SIGNED_AMOUNT_SQL})::float    AS amount,
    c.name                           AS "customerName",
    c.phone                          AS "customerPhone"
`;

const FROM_CLAUSE = `
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
`;

/** Dòng thô từ câu SELECT — `type`/`status` còn là giá trị cột. */
interface RawRow {
  id: string;
  code: string;
  type: InvoiceType;
  status: InvoiceStatus;
  createdAt: Date;
  issuedAt: Date | null;
  amount: number;
  customerName: string | null;
  customerPhone: string | null;
}

/**
 * Hoá đơn cho app mobile — tab Hoá đơn, lịch sử mua của một khách, và chi
 * tiết. Ca thứ tư trong module này tự đọc dữ liệu:
 *
 * 1. `GET /invoices` của web nằm sau `@RequireBranchScope()` và khoá cứng
 *    `created_at DESC`; `POST /v2/invoices/purchase-history/search` khoá cứng
 *    `issued_at DESC` và chỉ nhận MỘT trạng thái — trong khi màn lọc của app
 *    cho tick nhiều trạng thái, đổi chiều, và chọn mốc ngày.
 * 2. Cả hai trả nguyên `InvoiceEntity` kèm `items` cho từng dòng danh sách —
 *    app chỉ cần chín trường.
 *
 * Chi tiết thì NGƯỢC LẠI: uỷ quyền `InvoiceService.findOneWithItems` — nó đã
 * gom dòng hàng, thanh toán, tên thu ngân và khuyến mãi đã áp; chép lại là
 * bốn chỗ phân kỳ. Xem [findById].
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG (`resolveReportBranchScope`, cùng luật
 * Tổng quan và Doanh thu theo mặt hàng): `branchIds` vắng = mọi chi nhánh được
 * phân công, xin ngoài phân công là 403. Bản trước scope theo TỔ CHỨC với lý
 * do "một khách mua ở nhiều cửa hàng" — đã đổi (chốt với người dùng
 * 2026-09-12) vì hai lẽ: web khoá danh sách hoá đơn theo chi nhánh còn chặt
 * hơn, và mọi dữ liệu bán hàng của app phải cùng MỘT luật để nhóm "Cửa hàng"
 * ở bộ lọc (`/mobile/branches`) bày ra đúng tập mà số liệu cộng lên. Lịch sử
 * mua của khách đi cùng đường này nên cũng theo luật đó.
 */
@Injectable()
export class MobileInvoiceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invoices: InvoiceService,
  ) {}

  async list(
    query: {
      customerId?: string;
      page: number;
      limit: number;
      order: MobileInvoiceOrder;
      dateBasis: MobileInvoiceDateBasis;
      from?: string;
      to?: string;
      status?: MobileInvoiceStatus[];
      branchIds?: string[];
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileInvoicePageDto> {
    const { customerId, page, limit, order, dateBasis, from, to, search } =
      query;
    const offset = (page - 1) * limit;

    // Xin chi nhánh ngoài phân công → 403 từ util, không lặng lẽ bỏ khỏi tập.
    const branchIds = resolveReportBranchScope({
      requested: query.branchIds,
      actor,
    });

    // Tham số đánh số ĐỘNG — `$1` là organizationId, cùng cách hai service
    // kia. Mọi mảng đi qua `ANY($n::type[])` chứ không nội suy `IN (...)`.
    const params: unknown[] = [actor.organizationId];
    const where: string[] = ['i.organization_id = $1', 'i.is_draft = false'];

    // Trạng thái: vắng = mọi trạng thái app nhìn thấy; có = hợp của các nhóm.
    // Một MẢNG RỖNG đã bị chặn ở tầng gọi (app không gửi), nhưng nếu tới đây
    // thì `ANY('{}')` trả rỗng — đúng nghĩa "không trạng thái nào khớp".
    const statuses =
      query.status === undefined
        ? VISIBLE_STATUSES
        : query.status.flatMap((status) => STATUS_COLUMN_VALUES[status]);
    params.push(statuses);
    where.push(`i.status::text = ANY($${params.length}::text[])`);

    if (customerId !== undefined) {
      params.push(customerId);
      where.push(`i.customer_id = $${params.length}`);
    }

    // `branch_id` là VARCHAR trong bảng (di sản của `BaseEntity`), nên ép
    // mảng về text chứ không uuid — ép uuid là so hai kiểu khác nhau.
    params.push(branchIds);
    where.push(`i.branch_id = ANY($${params.length}::text[])`);

    const dateColumn = DATE_COLUMN[dateBasis];
    if (from !== undefined) {
      params.push(from);
      where.push(`${dateColumn} >= $${params.length}::date`);
    }
    // `to` là NGÀY trần: so `< to + 1 day` để bao trọn ngày cuối. So `<=`
    // với `2026-08-31` là `<= 2026-08-31 00:00`, tức cắt mất mọi hoá đơn lập
    // trong chính ngày đó — cùng bẫy đã ghi ở `PurchaseHistoryBloc` cũ.
    if (to !== undefined) {
      params.push(to);
      where.push(`${dateColumn} < ($${params.length}::date + INTERVAL '1 day')`);
    }

    if (search?.trim()) {
      params.push(`%${escapeLikeTerm(search.trim())}%`);
      where.push(`i.code ILIKE $${params.length}`);
    }

    const whereSql = `WHERE ${where.join('\n    AND ')}`;

    // Chốt tham số của câu đếm TRƯỚC khi thêm LIMIT/OFFSET.
    const countParams = [...params];

    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    // Tie-break: cột ngày đang sắp -> `created_at` -> `id`. Hai hoá đơn cùng
    // giây ghi sổ là chuyện thật ở quầy, và LIMIT/OFFSET trên ORDER BY không
    // duy nhất thì dòng lặp/sót khi cuộn.
    const direction = ORDER_DIRECTION[order];
    const dataSql = `
      ${SELECT_ROW}
      ${FROM_CLAUSE}
      ${whereSql}
      ORDER BY ${dateColumn} ${direction} NULLS LAST, i.created_at ${direction}, i.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // `totalAmount` LOẠI hoá đơn huỷ dù dòng huỷ vẫn nằm trong `data`: thanh
    // "Tổng" nói về tiền còn hiệu lực. Lọc bằng `FILTER` chứ không thêm vào
    // WHERE — WHERE là của cả `total` lẫn `data`, phải giống hệt câu trên.
    const countSql = `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(${SIGNED_AMOUNT_SQL}) FILTER (WHERE i.status::text <> 'cancelled'), 0)::float
          AS "totalAmount"
      ${FROM_CLAUSE}
      ${whereSql}
    `;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query<RawRow[]>(dataSql, params),
      this.dataSource.query<CountRow[]>(countSql, countParams),
    ]);

    return {
      data: rows.map(toMobileInvoice),
      total: countResult[0]?.total ?? 0,
      page,
      limit,
      totalAmount: countResult[0]?.totalAmount ?? 0,
    };
  }

  /**
   * Chi tiết — uỷ quyền `InvoiceService.findOneWithItems` (đã lọc tổ chức)
   * rồi nắn sang hình dạng app: dòng hàng, tiền khách đưa, tiền thừa, điểm.
   *
   * Hoá đơn NHÁP và `pending` là 404 ở đây dù `findOneWithItems` trả được:
   * danh sách không bao giờ đưa chúng cho app, nên một id như vậy chỉ có thể
   * tới từ nơi khác — và app không có màn nào vẽ được một hoá đơn chưa ghi sổ.
   *
   * Câu 404 tiếng Việt, KHÔNG nội suy id — cùng luật mọi đường mobile.
   */
  async findById(
    id: string,
    actor: ActorContext,
  ): Promise<MobileInvoiceDetailResponseDto> {
    const invoice = await this.invoices
      .findOneWithItems(id, actor)
      .catch((err: unknown) => {
        if (err instanceof NotFoundException) {
          throw new NotFoundException('Không tìm thấy hoá đơn.');
        }
        throw err;
      });

    const status = STATUS_OF[invoice.status];
    if (invoice.isDraft || status === undefined) {
      throw new NotFoundException('Không tìm thấy hoá đơn.');
    }

    // Dòng hàng theo CHIỀU của loại hoá đơn: bán/đổi liệt kê hàng đi ra, trả
    // hàng liệt kê hàng đi vào. Hoá đơn đổi hàng có cả hai chiều; app chỉ có
    // một bảng nên lấy chiều hàng mới giao — phần trả nằm ở hoá đơn gốc.
    const direction =
      invoice.type === InvoiceType.RETURN ? ItemDirection.IN : ItemDirection.OUT;
    const lines: MobileInvoiceLineDto[] = invoice.items
      .filter((item) => item.direction === direction)
      .map((item) => ({
        name: item.itemName,
        sku: item.itemCode,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: Number(item.lineTotal),
      }));

    const amount = signedAmount(invoice);
    // `cashReceived` là tiền khách ĐƯA (mọi phương thức), không phải
    // `total_paid` — cột đó đã trừ tiền thừa. Thừa = đưa − phải trả, không âm.
    //
    // Trả/đổi hàng có `amount` ÂM (tiền hoàn cho khách): khách không đưa gì,
    // nên "phải trả" chốt ở 0 — không thì tiền hoàn hiện thành tiền thừa.
    const cashReceived = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const changeAmount = Math.max(0, cashReceived - Math.max(amount, 0));

    const salesperson = invoice.salespersonId
      ? await this.salespersonName(invoice.salespersonId, actor)
      : null;

    // Điểm: cột `points_balance_after` là số dư SAU hoá đơn, app muốn số dư
    // TRƯỚC — suy ngược từ điểm cộng/dùng của chính hoá đơn. Vắng số dư sau
    // (hoá đơn cũ, khách không thẻ) thì không có gì để bày, trả `null`.
    const loyalty =
      invoice.pointsBalanceAfter == null
        ? null
        : {
            opening:
              invoice.pointsBalanceAfter -
              invoice.pointsEarned +
              invoice.pointsRedeemed,
            earned: invoice.pointsEarned,
            used: invoice.pointsRedeemed,
          };

    return {
      id: invoice.id,
      code: invoice.code,
      type: TYPE_OF[invoice.type],
      status,
      createdAt: invoice.createdAt.toISOString(),
      issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
      amount,
      customerName: invoice.customer?.name ?? null,
      customerPhone: invoice.customer?.phone ?? null,
      salesperson,
      cashier: invoice.staffName,
      subtotal: Number(invoice.subtotal),
      discount:
        Number(invoice.discountAmount) + Number(invoice.pointsDiscountAmount),
      cashReceived,
      changeAmount,
      promotions: invoice.appliedPromotions.map((promotion) => promotion.type),
      loyalty,
      lines,
    };
  }

  /**
   * Tên nhân viên bán: `salesperson_id` trỏ `employee_profiles`, tên thì nằm
   * ở `users` qua `user_id`. Một câu, lọc tổ chức ở cả hai bảng.
   */
  private async salespersonName(
    salespersonId: string,
    actor: ActorContext,
  ): Promise<string | null> {
    const [row] = await this.dataSource.query<NameRow[]>(
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS name
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id AND u.organization_id = $1
       WHERE ep.id = $2 AND ep.organization_id = $1`,
      [actor.organizationId, salespersonId],
    );
    return row?.name ?? null;
  }
}

/** Nắn một dòng thô của [SELECT_ROW] sang hình dạng app. */
function toMobileInvoice(row: RawRow): MobileInvoiceResponseDto {
  return {
    id: row.id,
    code: row.code,
    type: TYPE_OF[row.type],
    // Câu lệnh đã lọc `status IN VISIBLE_STATUSES` nên luôn có ánh xạ; lùi về
    // `unpaid` chỉ để thoả kiểu, không phải một nhánh chạy được.
    status: STATUS_OF[row.status] ?? MobileInvoiceStatus.UNPAID,
    createdAt: row.createdAt.toISOString(),
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    amount: row.amount,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
  };
}

/** Cùng công thức với [SIGNED_AMOUNT_SQL], cho bản ghi đã nạp qua TypeORM. */
function signedAmount(invoice: {
  type: InvoiceType;
  amountDue: number;
  netAmount: number;
}): number {
  return invoice.type === InvoiceType.SALE
    ? Number(invoice.amountDue)
    : Number(invoice.netAmount);
}

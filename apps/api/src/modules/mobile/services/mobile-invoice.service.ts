import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { SalesOrderEntity } from '../../sales-order/entities/sales-order.entity';
import { InvoiceSearchV2Dto } from '../../pos/dto/invoice-search-v2.dto';
import { InvoiceStatus, InvoiceType } from '../../pos/entities/invoice.entity';
import { CancelInvoiceDto } from '../../pos/dto/cancel-invoice.dto';
import { CancelInvoiceService } from '../../pos/services/cancel-invoice.service';
import { CancelReturnService } from '../../pos/services/cancel-return.service';
import { InvoiceService } from '../../pos/services/invoice.service';
import { SearchInvoicesV2Query } from '../../pos/queries/search-invoices-v2.query';
import { MobileInvoiceListQueryDto, MobileInvoiceStatusFilter } from '../dto/mobile-invoice-list.query.dto';

/**
 * Hoá đơn mà NGƯỜI GỌI được ghi công bán.
 *
 * Uỷ quyền cho `SearchInvoicesV2Query` — cùng truy vấn mà lưới hoá đơn của web
 * dùng, nên loại trừ hoá đơn nháp, tổng tiền và phần đính khách hàng đều không
 * phải viết lại.
 *
 * **Phạm vi ép ở đây, không ở client** (ADR-24). Đây là khác biệt đáng kể duy
 * nhất so với đường web, và là lý do đường mobile tồn tại thay vì gọi thẳng.
 */
const MOBILE_STATUS_TO_INVOICE: Record<MobileInvoiceStatusFilter, InvoiceStatus[]> = {
  paid: [InvoiceStatus.PAID],
  unpaid: [InvoiceStatus.PENDING, InvoiceStatus.DEBT, InvoiceStatus.PARTIAL_DEBT],
  cancelled: [InvoiceStatus.CANCELLED],
};

const INVOICE_NUMERIC_FIELDS = [
  'subtotal',
  'discountAmount',
  'pointsDiscountAmount',
  'depositAmount',
  'amountDue',
  'totalPaid',
  'refundedAmount',
  'netAmount',
  'offsetAmount',
  'keptChangeAmount',
] as const;
const ITEM_NUMERIC_FIELDS = [
  'quantity',
  'unitPrice',
  'unitPriceDefault',
  'costPrice',
  'lineDiscount',
  'lineDiscountValue',
  'promotionDiscount',
  'lineTotal',
  'returnedQuantity',
] as const;
const PAYMENT_NUMERIC_FIELDS = ['amount'] as const;

/** `null`/`undefined` giữ nguyên — vắng là ca hợp lệ, không phải `0`. */
function numbersOf<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Record<K, number | null>> {
  const out: Partial<Record<K, number | null>> = {};
  for (const key of keys) {
    const value = source[key] as unknown;
    if (value === null || value === undefined) continue;
    out[key] = Number(value);
  }
  return out;
}

@Injectable()
export class MobileInvoiceService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly invoices: InvoiceService,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profiles: Repository<EmployeeProfileEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly salesOrders: Repository<SalesOrderEntity>,
    private readonly cancelInvoice: CancelInvoiceService,
    private readonly cancelReturn: CancelReturnService,
  ) {}

  async list(query: MobileInvoiceListQueryDto, actor: ActorContext) {
    const salespersonId = await this.salespersonIdOf(actor);

    if (!salespersonId) {
      // Tài khoản chưa được gán hồ sơ nhân viên. Trả trang RỖNG chứ KHÔNG bỏ bộ
      // lọc: bỏ lọc là phơi trọn hoá đơn của cả chi nhánh cho đúng tài khoản mà
      // ta không xác định được danh tính nghiệp vụ.
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totals: { totalAmount: 0 },
      };
    }

    const dto: InvoiceSearchV2Dto = {
      page: query.page,
      limit: query.limit,
      salespersonId,
      // Vế thứ hai của "hoá đơn của tôi" — xem doc của `createdByUserId`. Thiếu
      // nó thì thu ngân không thấy chính hoá đơn mình vừa lập, vì chứng từ lập
      // tại quầy để `salesperson_id` trống.
      createdByUserId: actor.userId,
    };

    // Khoảng ngày chỉ gắn khi có ÍT NHẤT một đầu: một `DateRangeFilterDto` rỗng
    // đi vào `FilterBuilder` là một mệnh đề thừa trên mọi lượt gọi.
    if (query.from || query.to) {
      dto.createdAt = {
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
      } as InvoiceSearchV2Dto['createdAt'];
    }

    // Ô tìm ở header đi thẳng xuống bộ lọc tự do của v2 (số HĐ / tên / SĐT
    // khách). Không `trim` ở đây: `applyOrString` tự trim và bỏ qua chuỗi trống.
    if (query.search) {
      dto.search = query.search;
    }

    // Ba trạng thái của app -> tập giá trị thật. "Ghi nợ" gộp ba giá trị vì đó
    // đúng là cách `InvoiceModel` phía app đọc về (mọi giá trị không phải
    // paid/cancelled rơi về `unpaid`); lệch ở đây là lọc ra một tập mà màn
    // không bày được, hoặc ngược lại.
    if (query.status?.length) {
      dto.statuses = [...new Set(query.status.flatMap((s) => MOBILE_STATUS_TO_INVOICE[s]))];
    }

    return this.queryBus.execute(new SearchInvoicesV2Query(dto, actor));
  }

  /**
   * Một hoá đơn theo `id`, **kèm dòng hàng và các khoản thanh toán**.
   *
   * Uỷ quyền cho `InvoiceService.findOneWithItems` — nó đã gom sẵn đúng thứ tờ
   * hoá đơn cần: dòng hàng, khách, tên thu ngân, các khoản đã thu, công nợ còn
   * lại và ảnh chụp chương trình khuyến mại đã chạy lúc thanh toán.
   *
   * **Hoá đơn của người khác trả 404, KHÔNG phải 403.** Chúng nói hai điều
   * khác nhau: 403 nói *"nó tồn tại, bạn không được xem"* — tức xác nhận sự tồn
   * tại của một hoá đơn cho người không được biết nó tồn tại. 404 không xác
   * nhận gì. Với một đường mà id đoán được thì khác biệt đó là thật.
   */
  async getById(id: string, actor: ActorContext) {
    const salespersonId = await this.salespersonIdOf(actor);

    // Tra hoá đơn TRƯỚC rồi mới so: `findOneWithItems` đã ép phạm vi tổ chức và
    // ném 404 cho id không tồn tại, nên hai ca "không có" và "của người khác"
    // ra cùng một phản hồi mà không cần dựng thêm nhánh nào.
    const invoice = await this.invoices.findOneWithItems(id, actor);

    // BA cách một hoá đơn là "của tôi", đúng ba cách mà danh sách đã dùng — bán
    // nó, LẬP nó, hoặc nó sinh ra từ đơn hàng của tôi.
    //
    // Vế `createdBy` mở cùng lúc với bộ lọc danh sách (2026-09-15). Thiếu nó ở
    // đây thì danh sách bày ra những chứng từ mà chạm vào là 404 — đúng cái bẫy
    // "chọn được một thứ không dùng được" mà `MobileBranchService` đã ghi, chỉ
    // là ở chiều ngược lại.
    const own =
      (!!salespersonId && invoice.salespersonId === salespersonId) || invoice.createdBy === actor.userId;

    if (!own && !(await this.viaOwnSalesOrder(invoice.salesOrderId, actor))) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    // Cột `numeric` của TypeORM về dưới dạng CHUỖI ("650000.00"). Danh sách đã
    // đi qua `SearchInvoicesV2Handler` (có `Number()`), còn đường này trả thẳng
    // entity nên app phải tự cứu và bắn một cảnh báo `[parse]` cho MỖI trường,
    // mỗi lượt mở tờ hoá đơn (Loc thấy 2026-09-12). Ép về số ở đây, đúng một
    // chỗ, cho cùng hợp đồng với danh sách.
    return {
      ...invoice,
      ...numbersOf(invoice, INVOICE_NUMERIC_FIELDS),
      items: invoice.items.map((item) => ({ ...item, ...numbersOf(item, ITEM_NUMERIC_FIELDS) })),
      payments: invoice.payments.map((payment) => ({ ...payment, ...numbersOf(payment, PAYMENT_NUMERIC_FIELDS) })),
      salespersonName: await this.salespersonNameOf(invoice.salespersonId, actor),
    };
  }

  /**
   * Huỷ một chứng từ — cùng hai service mà POS gọi, không có bản thứ hai.
   *
   * **Phép NHÌN THẤY đi trước phép HUỶ.** `getById` ném 404 cho hoá đơn không
   * phải của người gọi, nên một người có `pos.invoice.cancel` vẫn không huỷ
   * được tờ hoá đơn mà chính app không cho họ mở. Quyền trả lời "được làm việc
   * này không"; phạm vi trả lời "trên tờ nào" — thiếu vế sau thì một quản lý
   * gõ đúng một `id` là huỷ được chứng từ của bất kỳ ai.
   *
   * Rẽ theo LOẠI chứng từ đúng như `InvoiceController.cancel`: huỷ một phiếu
   * trả/đổi là ảnh gương của huỷ một hoá đơn bán (tiền và hàng đi ngược chiều),
   * nên chính loại của chứng từ chọn service chứ không phải nơi gọi.
   *
   * Trả về tờ hoá đơn dưới HÌNH DẠNG MOBILE, không phải entity thô: cột
   * `numeric` của TypeORM về dưới dạng chuỗi, và app đã hai lần dính đúng cái
   * bẫy đó (`totalPaid` đọc nhầm, `type` viết HOA). Một đường trả về hình dạng
   * khác là mời nó lần thứ ba.
   */
  async cancel(id: string, dto: CancelInvoiceDto, actor: ActorContext) {
    const invoice = await this.getById(id, actor);

    if (invoice.type === InvoiceType.SALE) {
      await this.cancelInvoice.cancel(id, dto, actor);
    } else {
      await this.cancelReturn.cancel(id, dto, actor);
    }

    return this.getById(id, actor);
  }

  /**
   * Tên nhân viên bán, cho dòng *NVBH* của tờ hoá đơn.
   *
   * Trước đây đường này chỉ trả `salespersonId` — một uuid — nên app để dòng đó
   * TRỐNG thay vì bày mã nội bộ cho người dùng cuối. Đây là chỗ vá đúng: tên
   * người là thứ backend biết, không phải thứ client suy ra được.
   *
   * **Tra theo `salespersonId` của HOÁ ĐƠN, không theo người đang gọi**, dù ở
   * đường này hai thứ đó luôn trùng nhau (`getById` đã chặn hoá đơn của người
   * khác ngay phía trên). Suy từ người gọi là gài một quả bom hẹn giờ: ngày
   * phạm vi nới ra — quản lý xem hoá đơn của nhân viên chẳng hạn — tờ hoá đơn
   * sẽ ghi tên SAI mà không có gì đổ.
   *
   * Ghép `firstName lastName` đúng như `InvoiceService` đang ghép `staffName`:
   * hai dòng nằm cạnh nhau trên cùng một tờ hoá đơn, khác quy tắc ghép là lộ ra
   * ngay ở chỗ người dùng nhìn.
   */
  private async salespersonNameOf(
    salespersonId: string | null | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    if (!salespersonId) return null;

    const profile = await this.profiles.findOne({
      where: { id: salespersonId, organizationId: actor.organizationId },
      relations: { user: true },
    });
    const user = profile?.user;
    if (!user) return null;

    // `|| null` chứ không `?? null`: hai tên cùng rỗng cho ra chuỗi rỗng, mà
    // một chuỗi rỗng đẩy xuống app sẽ thành một dòng NVBH trống trơn thay vì
    // dấu "—" nói rõ là không có dữ liệu.
    return `${user.firstName} ${user.lastName}`.trim() || null;
  }

  /**
   * `employee_profiles.id` của người gọi.
   *
   * `salespersonId` của hoá đơn trỏ **`employee_profiles.id`**, không phải
   * `users.id` — xem comment ngay trên cột đó. So thẳng `actor.userId` vào nó là
   * so hai khoá từ hai bảng khác nhau: không bao giờ khớp, danh sách luôn rỗng,
   * và không có lỗi nào để lần ra.
   *
   * Bảng có `@Index(unique)` trên `user_id` nên tra ra tối đa một dòng.
   */
  /**
   * Hoá đơn NHÁP sinh từ *Nhận xử lý* (erp-sales-cashier, ADR-32) mang
   * `salesperson_id` của NV BÁN HÀNG ghi trên đơn — thường KHÔNG phải người
   * lập đơn. Tư vấn lập đơn vẫn phải mở được tờ hoá đơn đó (dòng "Hoá đơn"
   * trên tờ đơn, AC-60), và thu ngân đã duyệt cũng vậy. Đo 2026-09-14: đơn
   * chọn NV khác → `GET /mobile/invoices/:id` 404 cho chính người lập đơn.
   */
  private async viaOwnSalesOrder(salesOrderId: string | null | undefined, actor: ActorContext): Promise<boolean> {
    if (!salesOrderId) return false;
    const order = await this.salesOrders.findOne({
      where: { id: salesOrderId, organizationId: actor.organizationId },
      select: ['id', 'createdBy', 'approvedBy'],
    });

    return !!order && (order.createdBy === actor.userId || order.approvedBy === actor.userId);
  }

  private async salespersonIdOf(actor: ActorContext): Promise<string | undefined> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });

    return profile?.id;
  }
}

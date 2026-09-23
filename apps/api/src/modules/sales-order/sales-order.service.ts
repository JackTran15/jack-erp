import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import type { ActorContext } from '../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../branch/branch.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { ItemEntity } from '../inventory/location/item.entity';
import { MediaQueryService } from '../media/media-query.service';
import type { CreateInvoiceDto } from '../pos/dto/create-invoice.dto';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { LineDiscountType } from '../pos/entities/invoice-item.entity';
import { InvoiceService } from '../pos/services/invoice.service';
import { PosSessionService } from '../pos/services/pos-session.service';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { RbacService } from '../rbac/rbac.service';
import { PointsRedemptionService } from '../pos/services/points-redemption.service';
import { CancelInvoiceService } from '../pos/services/cancel-invoice.service';
import { CreateSalesOrderDto, SalesOrderLineDto } from './dto/create-sales-order.dto';
import type { PartnerCreateOrderDto, PartnerOrderLineDto } from './dto/partner-create-order.dto';
import { SalesOrderListQueryDto, UNASSIGNED_BRANCH_FILTER } from './dto/sales-order-list.query.dto';
import type { SalesChannelEntity } from './entities/sales-channel.entity';
import {
  SalesOrderDispatchAction,
  SalesOrderDispatchEventEntity,
} from './entities/sales-order-dispatch-event.entity';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
import { SalesOrderEntity, SalesOrderStatus } from './entities/sales-order.entity';

export const SALES_ORDER_PERMISSIONS = {
  read: 'pos.sales-order.read',
  create: 'pos.sales-order.create',
  cancel: 'pos.sales-order.cancel',
  approve: 'pos.sales-order.approve',
  reject: 'pos.sales-order.reject',
  /**
   * Phân đơn trong pool về một chi nhánh — quyền CẤP TỔ CHỨC, tách hẳn khỏi
   * {@link SALES_ORDER_PERMISSIONS.approve} (A-08). Dùng lại `approve` nghĩa là
   * mọi thu ngân chi nhánh đều đẩy được đơn sang chi nhánh khác.
   */
  dispatch: 'pos.sales-order.dispatch',
  /**
   * Đọc đơn TOÀN CHUỖI, không qua `BranchScopeGuard` (ADR-07). Tách khỏi
   * `read` vì `read` là phạm vi chi nhánh của app tư vấn viên.
   */
  readAll: 'pos.sales-order.read-all',
} as const;

/** Kênh bán ghi trên mọi đơn từ app tư vấn — chuỗi hiển thị, chốt vào chứng từ. */
export const SALES_ORDER_CHANNEL = 'Ứng dụng Tư Vấn';

/**
 * Dải số chứng từ của ĐƠN WEB.
 *
 * A-13 đòi một `DocumentType` RIÊNG cho đơn web (không dùng chung dải `DT` với
 * đơn tư vấn trên mobile). `DocumentType` là enum của `@erp/shared-interfaces`,
 * ngoài `touches:` của T-01-04, nên đợt này tạm dùng chung `SALES_ORDER`: số vẫn
 * duy nhất theo tổ chức, chỉ là không phân biệt được nguồn trên mã chứng từ.
 * Khi enum có thành viên riêng, đổi ĐÚNG hằng này — đừng gõ lại kiểu ở call site.
 */
export const PARTNER_ORDER_DOCUMENT_TYPE = DocumentType.SALES_ORDER;

/** Mã lỗi 400 khi `itemId` đối tác gửi không thuộc tổ chức (taxonomy 03-logical-design). */
const ORDER_LINE_ITEM_UNKNOWN = 'ORDER_LINE_ITEM_UNKNOWN';

/** Mã lỗi 403 khi kênh của API key đã ngừng hoạt động. */
const CHANNEL_INACTIVE = 'CHANNEL_INACTIVE';

/**
 * Mã lỗi 409 khi `dispatch` chạy trên đơn không còn ở `SENT` (taxonomy
 * 03-logical-design). Đơn đã duyệt / từ chối / huỷ thì không còn gì để phân.
 */
export const ORDER_NOT_DISPATCHABLE = 'ORDER_NOT_DISPATCHABLE';

/**
 * Mã lỗi 409 khi `dispatch` chạy trên đơn ĐÃ có chi nhánh.
 *
 * Nhận ra bằng SỐ DÒNG mà `UPDATE … WHERE branch_id IS NULL` đổi được, không
 * bằng một phép đọc rồi ghi: hai Admin bấm cùng lúc cho hai chi nhánh khác nhau
 * thì bên thua phải thấy lỗi này chứ không được ghi đè bên thắng.
 */
export const ORDER_ALREADY_DISPATCHED = 'ORDER_ALREADY_DISPATCHED';

/**
 * Mã lỗi 409 khi trả đơn về pool trên một đơn ĐÃ sinh hoá đơn (taxonomy
 * 03-logical-design).
 *
 * `sales_orders.invoice_id` là dấu hiệu DUY NHẤT cần kiểm: chỉ {@link approve}
 * ghi nó, và nó được ghi cùng lượt với `status = PROCESSED`. Một đơn đã có hoá
 * đơn mà quay về pool là một hoá đơn mồ côi ở chi nhánh không còn giữ đơn — và
 * `PROCESSED` không có đường về `SENT` (`VALID_TRANSITIONS`), nên đây là CHẶN,
 * không phải một bước dọn dẹp.
 */
export const ORDER_HAS_INVOICE = 'ORDER_HAS_INVOICE';

/**
 * Mã lỗi 403 khi người của chi nhánh A trả về một đơn mà chi nhánh B đang giữ
 * (taxonomy 03-logical-design).
 *
 * Chỉ áp cho người KHÔNG có {@link SALES_ORDER_PERMISSIONS.dispatch}: quyền điều
 * phối là quyền cấp tổ chức, nó vốn thao tác trên đơn của mọi chi nhánh.
 */
export const ORDER_NOT_HELD_BY_BRANCH = 'ORDER_NOT_HELD_BY_BRANCH';

/**
 * Mã lỗi 409 khi trả về một đơn KHÔNG có chi nhánh nào đang giữ — bản đối xứng
 * của {@link ORDER_ALREADY_DISPATCHED}.
 *
 * Hai ca cùng một mã, vì cùng một trạng thái: đơn còn nằm trong pool, và đơn vừa
 * bị người khác trả về trong lúc mình bấm. Nhận ra bằng SỐ DÒNG mà
 * `UPDATE … WHERE branch_id = :from` đổi được, nên hai lượt trả song song chỉ
 * một lượt ghi được vết — không có hai dòng `RETURN` cho một lần rời chi nhánh.
 *
 * KHÔNG có trong bảng taxonomy của `03-logical-design.md`; thêm ở đây vì bảng ấy
 * không lường ca "trả một đơn chưa ai giữ". Dùng lại `ORDER_NOT_DISPATCHABLE`
 * (vốn nghĩa là `status ≠ SENT`) sẽ làm hai trạng thái khác hẳn nhau trông y hệt
 * nhau từ phía client.
 */
export const ORDER_NOT_DISPATCHED = 'ORDER_NOT_DISPATCHED';

/**
 * Số điện thoại về MỘT dạng duy nhất trước khi khớp khách (A-01, AC-08).
 *
 * Quy tắc, viết một lần ở đây vì nó quyết định hai khách có phải một người hay
 * không: bỏ mọi ký tự không phải chữ số (khoảng trắng, `.`, `-`, `()`), bỏ dấu
 * `+`, rồi đầu số quốc gia `84` → `0`. `+84 901 234 567`, `84901234567` và
 * `0901234567` vì thế ra CÙNG một chuỗi `0901234567`.
 *
 * `840901234567` (đối tác nối mã quốc gia vào số đã có `0`) cũng về đúng chuỗi
 * ấy — bỏ số 0 thừa sau khi cắt `84`.
 */
export function normalizePartnerPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  const withoutPlus = digits.startsWith('+') ? digits.slice(1) : digits;
  if (withoutPlus.startsWith('84')) {
    return `0${withoutPlus.slice(2).replace(/^0+/, '')}`;
  }
  return withoutPlus;
}

/** True cho vi phạm UNIQUE của Postgres (23505) — cùng cách nhận dạng với `pos-deposit-sale.consumer`. */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; driverError?: { code?: string } } | null;
  return e?.code === '23505' || e?.driverError?.code === '23505';
}

/** Một dòng trả cho đối tác — đơn giá là giá SERVER đã chốt, không phải giá họ gửi. */
export interface PartnerOrderLineResult {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Kết quả của {@link SalesOrderService.createFromPartner}.
 *
 * KHÔNG dùng {@link SalesOrderView}: đường đọc kia đi qua `scopeOf` (hồ sơ nhân
 * viên + quyền duyệt) và một API key không có hồ sơ nào, nên nó sẽ 404 chính
 * đơn vừa ghi.
 */
export interface PartnerOrderResult {
  id: string;
  documentNumber: string;
  status: SalesOrderStatus;
  /** Tiền hàng phải thu; CHƯA gồm phí giao. */
  amountDue: number;
  shippingFee: number;
  lines: PartnerOrderLineResult[];
  /** `true` ⇒ đơn đã có từ trước, controller đáp 200 thay vì 201 (AC-06). */
  replayed: boolean;
}

/**
 * `SENT` có ba lối ra; `PROCESSED` có ĐÚNG MỘT — huỷ.
 *
 * Lối ra ấy MỞ ở T-07-01 (ADR-06 cho phép, và ticket buộc ghi lại việc mở):
 * trước đó `PROCESSED` là điểm cuối, nên một đơn đã phát hành hoá đơn KHÔNG huỷ
 * được bằng bất kỳ đường nào — trong khi AC-24 đòi đúng điều đó. Mở được vì huỷ
 * đơn đã có hoá đơn KHÔNG phải một lượt đổi trạng thái đơn thuần: nó đi qua
 * {@link CancelInvoiceService}, thứ đảo kho, trả điểm và đóng công nợ trước khi
 * đơn kịp đổi (xem {@link SalesOrderService.cancel}).
 *
 * CHỈ `CANCELLED` được thêm: `REJECTED` vẫn đóng với `PROCESSED`, vì từ chối một
 * đơn đã bán ra là để lại một hoá đơn sống cạnh một đơn bị từ chối.
 */
const VALID_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  [SalesOrderStatus.DRAFT]: [SalesOrderStatus.SENT, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.SENT]: [SalesOrderStatus.PROCESSED, SalesOrderStatus.REJECTED, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.PROCESSED]: [SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.REJECTED]: [],
  [SalesOrderStatus.CANCELLED]: [],
};

export interface SalesOrderLineView {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  manualDiscount: number;
  manualDiscountReason: string | null;
  promotionDiscount: number;
  promotionName: string | null;
  note: string | null;
  lineTotal: number;
  /**
   * Ảnh bìa của MẪU MÃ cha (biến thể không có ảnh riêng — A-08), `null` khi
   * chưa có ảnh. Chỉ đường CHI TIẾT tra; danh sách luôn `null` để khỏi thêm
   * một lượt tra media cho cả trang.
   */
  thumbnailUrl: string | null;
}

export interface SalesOrderView {
  id: string;
  code: string;
  status: SalesOrderStatus;
  createdAt: Date;
  /** NULL với đơn web — ở đó không có tư vấn viên (A-04). */
  salespersonId: string | null;
  salespersonName: string | null;
  salesChannel: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discount: number;
  amountDue: number;
  /** Phí giao hàng thu khách; 0 với đơn mobile. `numeric` về dưới dạng CHUỖI — ép ở `toView`. */
  shippingFee: number;
  /** Người NHẬN hàng — khác người đặt được; NULL với đơn mobile. */
  recipientName: string | null;
  recipientPhone: string | null;
  /**
   * TÊN tỉnh/phường đã CHỐT trên đơn (ADR-05, AC-03) — không bao giờ join lại
   * `geo_provinces`/`geo_wards` để tra: dataset địa giới đổi tên theo đợt sáp
   * nhập, và đơn cũ phải giữ nguyên cái tên đã in.
   */
  shipProvinceName: string | null;
  shipWardName: string | null;
  shipAddressLine: string | null;
  /** Mã đơn phía website; NULL với đơn mobile. */
  externalOrderId: string | null;
  /** `sales_channels.id` để lọc theo nguồn; nhãn hiển thị vẫn là {@link salesChannel}. */
  salesChannelId: string | null;
  note: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  /** Điểm tích luỹ DỰ KIẾN dùng — chưa trừ; thu ngân chốt lúc *Nhận xử lý*. */
  pointsRedeemed: number;
  /** Lựa chọn CTKM của tư vấn (ADR-52) — app nạp lại khi sửa đơn. */
  selectedProgramIds: string[];
  excludedProgramIds: string[];
  /** Hoá đơn nháp do `approve` tạo (ADR-32); null khi chưa nhận xử lý. */
  invoiceId: string | null;
  invoiceCode: string | null;
  /**
   * Hoá đơn của đơn CÒN là nháp (chưa thu tiền) — app bày nút *Tiếp tục thu tiền*
   * trên đơn đã *Nhận xử lý* mà rời giỏ trước khi thu (Loc báo 2026-09-22: đơn
   * rời hộp đơn chờ và không còn lối mở lại nháp). Chỉ đường CHI TIẾT tra; danh
   * sách luôn `null`. `null` cũng khi đơn chưa có hoá đơn.
   */
  invoiceIsDraft: boolean | null;
  lines: SalesOrderLineView[];
}

/**
 * Tham số của {@link SalesOrderService.listForOrganization}.
 *
 * Khai ở đây, không ở controller: service là nơi `unassigned` đổi NGHĨA của lượt
 * đọc (pool hay toàn chuỗi) và do đó đổi cả quyền cần có. DTO của controller chỉ
 * cần thoả hình dạng này.
 */
export interface OrgSalesOrderListQuery extends SalesOrderListQueryDto {
  /** `true` = chỉ pool chưa phân (`branch_id IS NULL`, A-03). */
  unassigned?: boolean;
  /**
   * Lọc theo chi nhánh: uuid, hoặc {@link UNASSIGNED_BRANCH_FILTER} cho pool.
   * Bỏ trống = không lọc chi nhánh (toàn chuỗi).
   */
  branchId?: string;
}

/**
 * Một dòng của lưới *Tất cả đơn*: {@link SalesOrderView} cộng chi nhánh đang
 * giữ đơn, gắn INLINE vào từng dòng (tiền lệ `inline_relations_over_root_map`)
 * thay vì một root map `{[id]: name}` bên cạnh `data`.
 */
export interface OrgSalesOrderView extends SalesOrderView {
  /** `null` = đơn còn trong pool, chưa phân cho chi nhánh nào. */
  branchId: string | null;
  /**
   * Tên chi nhánh để hiển thị. `null` khi đơn còn trong pool — VÀ cũng `null`
   * khi chi nhánh đã bị xoá khỏi `branches`: `sales_orders.branch_id` không có
   * FK, nên một id trỏ vào hư không là trạng thái CÓ THẬT của bảng. Dòng vẫn
   * phải hiện ra (kèm `branchId` để tra), không được biến mất khỏi lưới.
   */
  branchName: string | null;
}

@Injectable()
export class SalesOrderService {
  private readonly logger = new Logger(SalesOrderService.name);

  constructor(
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    @InjectRepository(SalesOrderLineEntity)
    private readonly lines: Repository<SalesOrderLineEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profiles: Repository<EmployeeProfileEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
    private readonly numbering: DocumentNumberingService,
    private readonly rbac: RbacService,
    private readonly invoiceService: InvoiceService,
    private readonly posSessions: PosSessionService,
    private readonly points: PointsRedemptionService,
    // ADR-06: huỷ đơn KHÔNG viết đường đảo riêng — gọi lại đúng service đã đảo
    // kho, điểm và công nợ cho hoá đơn POS.
    private readonly cancelInvoiceService: CancelInvoiceService,
    // Tuỳ chọn: `MediaModule` là `@Global()` nên Nest luôn tiêm; spec cũ dựng
    // service bằng tay không truyền thì dòng đơn chỉ thiếu ảnh.
    @Optional() private readonly mediaQuery?: MediaQueryService,
  ) {}

  async create(dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const branchId = this.branchOf(actor);
    const salesperson = dto.salespersonId
      ? await this.salespersonById(dto.salespersonId, actor)
      : await this.salespersonOf(actor);
    const prepared = await this.prepareLines(dto.lines, actor);
    const customer = await this.customerSnapshotOf(dto.customerId, actor);

    const saved = await this.dataSource.transaction(async (manager) => {
      // `manager` BẮT BUỘC: sinh số ngoài transaction là mượn connection thứ hai
      // và có thể khoá chết pool (doc tại DocumentNumberingService.generate).
      const documentNumber = await this.numbering.generate(DocumentType.SALES_ORDER, branchId, actor, manager);

      const order = manager.create(SalesOrderEntity, {
        organizationId: actor.organizationId,
        branchId,
        createdBy: actor.userId,
        documentNumber,
        status: dto.isDraft ? SalesOrderStatus.DRAFT : SalesOrderStatus.SENT,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        salesChannel: SALES_ORDER_CHANNEL,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        // Điểm DỰ KIẾN — chỉ GHI LẠI, không trừ và không đụng `amountDue`.
        // Vắng khoá nghĩa là không dùng điểm, nên `?? 0` chứ không giữ giá trị cũ:
        // `update` thay TRỌN đơn, và một con số điểm sống sót qua một lượt sửa
        // không nhắc tới nó là một ưu đãi không ai còn nhớ đã đặt.
        pointsRedeemed: dto.pointsRedeemed ?? 0,
        // Cùng luật "thay TRỌN": vắng khoá = không chọn gì, không giữ lựa chọn cũ.
        selectedProgramIds: dto.selectedProgramIds ?? [],
        excludedProgramIds: dto.excludedProgramIds ?? [],
        ...prepared.totals,
      });
      const persisted = await manager.save(SalesOrderEntity, order);
      await manager.save(
        SalesOrderLineEntity,
        prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: persisted.id })),
      );
      return persisted;
    });

    this.logger.log(`Sales order ${saved.documentNumber} created (org=${actor.organizationId}, branch=${branchId})`);
    return this.getById(saved.id, actor);
  }

  /**
   * Đơn của ĐỐI TÁC (website công ty) — đường RIÊNG, đặt CẠNH {@link create},
   * không sửa đường cũ. Ba khác biệt là lý do nó không gộp được:
   * `branchId` NULL (đơn vào pool chưa phân, A-03), `salespersonId` NULL (không
   * có tư vấn viên, A-04) và giá do SERVER chốt chứ không nhận từ payload.
   *
   * `channel` là THAM SỐ, không tự suy ra từ API key hay từ actor: `api_keys`
   * hiện KHÔNG có cột kênh, nên người gọi (controller partner) là nơi quyết định
   * kênh và truyền xuống. Kênh không bao giờ đọc từ payload đối tác — key rò
   * sang kênh khác là đơn gắn sai nguồn.
   *
   * `geo` mang TÊN tỉnh/phường mà người gọi đã tra được khi kiểm mã
   * (`GEO_CODE_UNKNOWN`). Nhận sẵn thay vì tự tra: service này không có
   * `GeoService`, và người gọi đã phải tra đúng hai cái tên ấy để kiểm mã rồi.
   * Tên được CHỐT xuống đơn, không đọc lại (ADR-05).
   */
  async createFromPartner(
    dto: PartnerCreateOrderDto,
    channel: SalesChannelEntity,
    actor: ActorContext,
    geo: { provinceName?: string | null; wardName?: string | null } = {},
  ): Promise<PartnerOrderResult> {
    if (!channel.isActive) {
      throw new ForbiddenException({ code: CHANNEL_INACTIVE, message: 'Kênh bán đã ngừng hoạt động' });
    }

    // Giá CHỐT ở đây, từ `items.selling_price` tại thời điểm NHẬN đơn (AC-04).
    // Không gọi `PromotionApplyService`/`EvaluateCartHandler`: đơn web không có
    // khuyến mại, kể cả khi một CTKM toàn chuỗi đang bật (AC-05).
    const prepared = await this.partnerLines(dto.lines, actor);
    // Khách khớp/tạo NGOÀI transaction đơn: một vi phạm UNIQUE bên trong sẽ huỷ
    // cả transaction (Postgres 25P02), nên không thể vừa bắt vừa đọc lại ở đó.
    const customer = await this.partnerCustomer(dto.customer, actor);
    const shippingFee = dto.shipping.fee ?? 0;

    try {
      const { order, lines } = await this.dataSource.transaction(async (manager) => {
        const documentNumber = await this.numbering.generate(PARTNER_ORDER_DOCUMENT_TYPE, undefined, actor, manager);

        const entity = manager.create(SalesOrderEntity, {
          organizationId: actor.organizationId,
          // Pool chưa phân: KHÔNG set chi nhánh. `list()` của mobile hard-filter
          // theo chi nhánh nên đơn này vô hình với mọi chi nhánh (AC-01).
          branchId: undefined,
          createdBy: actor.userId,
          documentNumber,
          status: SalesOrderStatus.SENT,
          salespersonId: null,
          salespersonName: null,
          // Nhãn kênh là SNAPSHOT; đổi tên kênh về sau không đổi chứng từ cũ (ADR-03).
          salesChannel: channel.name,
          salesChannelId: channel.id,
          externalOrderId: dto.externalOrderId,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone ?? null,
          recipientName: dto.recipient.name,
          recipientPhone: dto.recipient.phone,
          shipProvinceCode: dto.shipping.provinceCode,
          shipProvinceName: geo.provinceName ?? null,
          shipWardCode: dto.shipping.wardCode,
          shipWardName: geo.wardName ?? null,
          shipAddressLine: dto.shipping.addressLine,
          shippingFee: String(shippingFee),
          note: dto.note ?? null,
          pointsRedeemed: 0,
          ...prepared.totals,
        });
        const persisted = await manager.save(SalesOrderEntity, entity);
        await manager.save(
          SalesOrderLineEntity,
          prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: persisted.id })),
        );
        return { order: persisted, lines: prepared.lines };
      });

      this.logger.log(
        `Partner sales order ${order.documentNumber} created (org=${actor.organizationId}, channel=${channel.code}, external=${dto.externalOrderId})`,
      );
      return this.toPartnerResult(order, lines, false);
    } catch (error) {
      // Chống trùng ở tầng DB, không check-then-insert: hai request song song
      // cùng `externalOrderId` thì một bên thua ở UNIQUE
      // `(organization_id, sales_channel_id, external_order_id)` và lấy đơn của
      // bên thắng (AC-06). Đọc bằng repository — transaction trên đã cuộn lại.
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.orders.findOne({
        where: {
          organizationId: actor.organizationId,
          salesChannelId: channel.id,
          externalOrderId: dto.externalOrderId,
        },
      });
      // 23505 mà KHÔNG phải đơn trùng (vd đụng số chứng từ) thì không nuốt.
      if (!existing) throw error;

      const lines = await this.lines.find({ where: { salesOrderId: existing.id }, order: { lineNo: 'ASC' } });
      this.logger.log(
        `Partner sales order replay (org=${actor.organizationId}, channel=${channel.code}, external=${dto.externalOrderId}) → ${existing.documentNumber}`,
      );
      return this.toPartnerResult(existing, lines, true);
    }
  }

  /**
   * Khách của đơn web: khớp theo SĐT đã chuẩn hoá, chưa có thì tạo (A-01, AC-08).
   *
   * Không nhận `customerId` từ đối tác — website không biết khoá của ERP; SĐT là
   * khoá duy nhất, và `customers` đã có UNIQUE `(organization_id, phone)` đỡ cho
   * lượt chạy song song.
   */
  private async partnerCustomer(
    input: PartnerCreateOrderDto['customer'],
    actor: ActorContext,
  ): Promise<CustomerEntity> {
    const phone = normalizePartnerPhone(input.phone);
    const existing = await this.customers.findOne({ where: { organizationId: actor.organizationId, phone } });
    if (existing) return existing;

    const code = await this.numbering.generate(DocumentType.CUSTOMER, undefined, actor);
    try {
      return await this.customers.save(
        this.customers.create({
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          code,
          name: input.name.trim(),
          phone,
          email: input.email,
        }),
      );
    } catch (error) {
      // Hai đơn web của cùng một khách mới, cùng lúc: bên thua đọc lại bên thắng.
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.customers.findOne({ where: { organizationId: actor.organizationId, phone } });
      if (!raced) throw error;
      return raced;
    }
  }

  /**
   * Dòng hàng của đơn web: đối tác gửi `itemId` + `quantity`, đơn giá đọc từ
   * `items.selling_price` NGAY LÚC NÀY và chốt vào `sales_order_lines.unit_price`
   * (AC-04). Không khoản giảm nào — đơn web không qua engine CTKM (AC-05).
   */
  private async partnerLines(dtoLines: PartnerOrderLineDto[], actor: ActorContext) {
    if (!dtoLines?.length) throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');

    // Đối tác gửi MÃ hàng (T-01-08). `items.code` UNIQUE theo tổ chức; so khớp
    // byte-exact như Partner Catalog API — không re-case, chỉ bỏ khoảng trắng hai đầu.
    const codes = [...new Set(dtoLines.map((l) => l.itemCode.trim()))];
    const found = await this.items.find({
      where: { code: In(codes), organizationId: actor.organizationId },
      select: ['id', 'code', 'name', 'unit', 'sellingPrice'],
    });
    const byCode = new Map(found.map((item) => [item.code, item]));
    const missing = codes.filter((code) => !byCode.has(code));
    if (missing.length) {
      throw new BadRequestException({
        code: ORDER_LINE_ITEM_UNKNOWN,
        message: `Hàng hoá không tồn tại trong tổ chức: ${missing.join(', ')}`,
      });
    }

    let subtotal = 0;
    const lines = dtoLines.map((line, index) => {
      const item = byCode.get(line.itemCode.trim()) as ItemEntity;
      const unitPrice = Number(item.sellingPrice);
      const lineTotal = line.quantity * unitPrice;
      subtotal += lineTotal;
      return {
        lineNo: index + 1,
        itemId: item.id,
        // Mã / tên / ĐVT là BẢN CHỤP, như mọi dòng chứng từ khác.
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        quantity: String(line.quantity),
        unitPrice: String(unitPrice),
        manualDiscount: '0',
        manualDiscountReason: null,
        promotionDiscount: '0',
        promotionName: null,
        note: null,
        lineTotal: String(lineTotal),
      };
    });

    return { lines, totals: { subtotal: String(subtotal), discount: '0', amountDue: String(subtotal) } };
  }

  /** Tiền về từ `numeric` dưới dạng CHUỖI — ép về số đúng một chỗ, như `toView`. */
  private toPartnerResult(
    order: SalesOrderEntity,
    lines: Array<Pick<SalesOrderLineEntity, 'itemId' | 'itemCode' | 'itemName' | 'quantity' | 'unitPrice' | 'lineTotal'>>,
    replayed: boolean,
  ): PartnerOrderResult {
    return {
      id: order.id,
      documentNumber: order.documentNumber,
      status: order.status,
      amountDue: Number(order.amountDue),
      shippingFee: Number(order.shippingFee ?? 0),
      lines: lines.map((line) => ({
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
      replayed,
    };
  }

  /**
   * Sửa đơn của CHÍNH mình khi còn `DRAFT` hoặc `SENT` — thay trọn dòng, giữ số
   * chứng từ. `DRAFT` + `isDraft: false` là GỬI; `SENT` + `isDraft: true` bị từ
   * chối: đơn đã tới thu ngân không rút về lưu tạm được.
   */
  async update(id: string, dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const me = await this.salespersonOf(actor);
    const salesperson = dto.salespersonId ? await this.salespersonById(dto.salespersonId, actor) : me;
    const prepared = await this.prepareLines(dto.lines, actor);
    const customer = await this.customerSnapshotOf(dto.customerId, actor);

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (!this.isOwn(current, me.id, actor)) {
        // 404 chứ không 403: không xác nhận sự tồn tại của đơn người khác.
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (current.status !== SalesOrderStatus.SENT && current.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException('Đơn hàng đã được xử lý, không sửa được nữa');
      }
      if (current.status === SalesOrderStatus.SENT && dto.isDraft) {
        throw new BadRequestException('Đơn đã gửi không lưu tạm lại được');
      }

      await manager.delete(SalesOrderLineEntity, { salesOrderId: id });
      await manager.save(
        SalesOrderLineEntity,
        prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: id })),
      );
      await manager.update(SalesOrderEntity, id, {
        status: dto.isDraft ? SalesOrderStatus.DRAFT : SalesOrderStatus.SENT,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        // Điểm DỰ KIẾN — chỉ GHI LẠI, không trừ và không đụng `amountDue`.
        // Vắng khoá nghĩa là không dùng điểm, nên `?? 0` chứ không giữ giá trị cũ:
        // `update` thay TRỌN đơn, và một con số điểm sống sót qua một lượt sửa
        // không nhắc tới nó là một ưu đãi không ai còn nhớ đã đặt.
        pointsRedeemed: dto.pointsRedeemed ?? 0,
        // Cùng luật "thay TRỌN": vắng khoá = không chọn gì, không giữ lựa chọn cũ.
        selectedProgramIds: dto.selectedProgramIds ?? [],
        excludedProgramIds: dto.excludedProgramIds ?? [],
        ...prepared.totals,
      });
    });

    return this.getById(id, actor);
  }

  /**
   * Nhân viên của CHI NHÁNH hiện tại để gắn vào đơn: có hồ sơ, tài khoản đang
   * hoạt động, được phân vào chi nhánh (`user_branch_assignments`).
   */
  async salespeople(query: { page?: number; limit?: number; search?: string }, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.profiles
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .innerJoin(
        UserBranchAssignmentEntity,
        'uba',
        // So sánh qua TEXT ở cả hai vế: bảng này lưu uuid thật còn `employee_profiles`
        // /`users` trộn uuid với varchar tuỳ cột (đo 2026-09-13) — để Postgres tự suy
        // kiểu là `operator does not exist: character varying = uuid`.
        'CAST(uba.userId AS text) = CAST(user.id AS text) AND CAST(uba.branchId AS text) = :branch AND CAST(uba.organizationId AS text) = :org',
        { branch: this.branchOf(actor), org: actor.organizationId },
      )
      .where('profile.organizationId = :org', { org: actor.organizationId })
      .andWhere('user.isActive = true');

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        "(profile.code ILIKE :q OR user.firstName ILIKE :q OR user.lastName ILIKE :q OR (user.firstName || ' ' || user.lastName) ILIKE :q OR profile.mobile ILIKE :q)",
        { q: `%${search.replace(/[%_]/g, (c) => `\\${c}`)}%` },
      );
    }

    const [rows, total] = await qb
      .select(['profile.id', 'profile.code', 'profile.mobile', 'user.firstName', 'user.lastName'])
      .orderBy('user.lastName', 'ASC')
      .addOrderBy('user.firstName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((profile) => ({
        id: profile.id,
        code: profile.code,
        name: `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim(),
        phone: profile.mobile ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async list(query: SalesOrderListQueryDto, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = await this.scopeOf(actor);
    const mine = await this.profileIdOf(actor);
    const own = '(so.salespersonId = :sp OR so.createdBy = :me)';
    const ownParams = { sp: mine ?? '00000000-0000-0000-0000-000000000000', me: actor.userId };

    const qb = this.orders
      .createQueryBuilder('so')
      .where('so.organizationId = :org', { org: actor.organizationId })
      // `query.branchId` thắng `X-Branch-Id`: app quản lý xem đơn của một cửa
      // hàng KHÁC cửa hàng đang làm việc. Guard đã kiểm id đó thuộc tập phân
      // công của người gọi, nên ở đây không kiểm lại.
      .andWhere('so.branchId = :branch', { branch: query.branchId ?? this.branchOf(actor) });

    // Tư vấn thấy đơn CỦA MÌNH (ghi công bán cho mình, hoặc do mình tạo cho
    // người khác); người có quyền duyệt (thu ngân) thấy mọi đơn của chi nhánh
    // — trừ đơn LƯU TẠM, thứ riêng của người gửi. Ép ở đây, không nhận từ
    // query — cùng luật với `/mobile/invoices`.
    if (scope.salespersonId) {
      qb.andWhere(own, ownParams);
    }
    if (query.awaitingCashier) {
      qb.andWhere(
        '(so.status = :sent OR (so.status = :processed AND EXISTS ' +
          '(SELECT 1 FROM invoices i WHERE i.id = so.invoice_id AND i.is_draft = true)))',
        { sent: SalesOrderStatus.SENT, processed: SalesOrderStatus.PROCESSED },
      );
    } else if (query.status === SalesOrderStatus.DRAFT) {
      // Đơn LƯU TẠM luôn là "của mình", kể cả với người có quyền duyệt: thu ngân
      // cũng có giỏ riêng, và không ai được thấy giỏ dở của người khác. (Lượt e2e
      // 2026-09-13 đỏ đúng ở đây: tài khoản test có quyền duyệt nên bị loại
      // draft của chính nó.)
      qb.andWhere(own, ownParams).andWhere('so.status = :status', { status: SalesOrderStatus.DRAFT });
    } else if (query.status) {
      qb.andWhere('so.status = :status', { status: query.status });
    } else {
      // Không lọc = "lịch sử": đơn lưu tạm có màn riêng, không trộn vào đây.
      qb.andWhere('so.status <> :draft', { draft: SalesOrderStatus.DRAFT });
    }
    if (query.from) qb.andWhere('so.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('so.createdAt <= :to', { to: new Date(query.to) });

    const [rows, total] = await qb
      .orderBy('so.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const lines = rows.length
      ? await this.lines.find({ where: { salesOrderId: In(rows.map((r) => r.id)) }, order: { lineNo: 'ASC' } })
      : [];
    const linesByOrder = new Map<string, SalesOrderLineEntity[]>();
    for (const line of lines) {
      const bucket = linesByOrder.get(line.salesOrderId) ?? [];
      bucket.push(line);
      linesByOrder.set(line.salesOrderId, bucket);
    }

    const invoiceCodes = await this.invoiceCodesOf(rows, actor.organizationId);

    return {
      data: rows.map((row) => this.toView(row, linesByOrder.get(row.id) ?? [], invoiceCodes.get(row.invoiceId ?? '') ?? null)),
      total,
      page,
      limit,
    };
  }

  /**
   * Đường đọc CẤP TỔ CHỨC của Admin — bản SONG SINH của {@link list}, cố ý
   * không gộp (ADR-07). `list()` hard-filter `so.branchId = actor.branchId` và
   * app tư vấn viên đang dựa vào đúng ràng buộc đó; nới nó ra là rò đơn giữa
   * các chi nhánh (A-09). Hàm này vì thế KHÔNG lọc chi nhánh và KHÔNG gọi
   * {@link scopeOf} — phạm vi ở đây do quyền quyết định, không do hồ sơ nhân
   * viên.
   *
   * Hai phạm vi, hai quyền:
   * - `unassigned = true` → pool `branch_id IS NULL` (A-03), cho người điều phối;
   * - không `unassigned` → toàn chuỗi, đòi THÊM `read-all`.
   *
   * Phép kiểm `read-all` nằm ở ĐÂY chứ không ở decorator: guard chỉ đọc được
   * metadata tĩnh, mà quyền cần có lại phụ thuộc một tham số query. Người chỉ
   * có `dispatch` gọi không kèm `unassigned` sẽ ăn 403 — không phải một trang
   * toàn chuỗi.
   */
  async listForOrganization(query: OrgSalesOrderListQuery, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (!query.unassigned) {
      const canReadAll = await this.rbac.hasPermission(
        actor.userId,
        actor.organizationId,
        SALES_ORDER_PERMISSIONS.readAll,
      );
      if (!canReadAll) {
        throw new ForbiddenException(`Missing required permission: ${SALES_ORDER_PERMISSIONS.readAll}`);
      }
    }

    const qb = this.orders
      .createQueryBuilder('so')
      .where('so.organizationId = :org', { org: actor.organizationId });

    // `unassigned=true` (màn Điều phối) và `branchId=UNASSIGNED` (ô lọc của lưới
    // Tất cả đơn) là CÙNG một mệnh đề — hai lối vào của cùng một phạm vi.
    if (query.unassigned || query.branchId === UNASSIGNED_BRANCH_FILTER) {
      qb.andWhere('so.branchId IS NULL');
    } else if (query.branchId) {
      qb.andWhere('so.branchId = :branchFilter', { branchFilter: query.branchId });
    }
    // Đơn LƯU TẠM là giỏ riêng của người gửi — không có phạm vi nào, kể cả cấp
    // tổ chức, làm nó hiện ra. `AdminSalesOrderListQueryDto` chặn `status=DRAFT`
    // ngay ở tầng validate; mệnh đề này là hàng rào thứ hai.
    qb.andWhere('so.status <> :draft', { draft: SalesOrderStatus.DRAFT });
    if (query.status && query.status !== SalesOrderStatus.DRAFT) {
      qb.andWhere('so.status = :status', { status: query.status });
    }
    if (query.from) qb.andWhere('so.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('so.createdAt <= :to', { to: new Date(query.to) });

    const [rows, total] = await qb
      .orderBy('so.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const lines = rows.length
      ? await this.lines.find({ where: { salesOrderId: In(rows.map((r) => r.id)) }, order: { lineNo: 'ASC' } })
      : [];
    const linesByOrder = new Map<string, SalesOrderLineEntity[]>();
    for (const line of lines) {
      const bucket = linesByOrder.get(line.salesOrderId) ?? [];
      bucket.push(line);
      linesByOrder.set(line.salesOrderId, bucket);
    }

    const [branchNames, invoiceCodes] = await Promise.all([
      this.branchNamesOf(rows, actor.organizationId),
      this.invoiceCodesOf(rows, actor.organizationId),
    ]);

    return {
      data: rows.map<OrgSalesOrderView>((row) => ({
        ...this.toView(row, linesByOrder.get(row.id) ?? [], invoiceCodes.get(row.invoiceId ?? '') ?? null),
        branchId: row.branchId ?? null,
        branchName: row.branchId ? branchNames.get(row.branchId) ?? null : null,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Tên chi nhánh của các đơn trong MỘT trang, tra bằng một lượt đọc theo khoá.
   *
   * KHÔNG `leftJoin` trong câu SQL của lưới, vì hai lý do của chính bảng này:
   * 1. `sales_orders.branch_id` là `character varying` còn `branches.id` là
   *    `uuid`, và Postgres không có toán tử `varchar = uuid` — join buộc phải
   *    ép kiểu tay, thứ dễ gãy âm thầm khi một bên đổi kiểu;
   * 2. không có FK nào bắt id ấy phải tồn tại. Một `INNER JOIN` sẽ làm đơn của
   *    chi nhánh đã xoá BIẾN MẤT khỏi lưới — đúng kiểu hỏng không ai thấy.
   *
   * Lượt đọc phụ này bị chặn trên bởi cỡ trang (≤ 100 id phân biệt) và bỏ hẳn
   * khi cả trang là đơn pool, nên không phải N+1.
   *
   * Repository lấy qua `dataSource` chứ không `@InjectRepository`: `BranchEntity`
   * không nằm trong `forFeature` của `SalesOrderModule`, và module không thuộc
   * phạm vi ticket này.
   */
  /**
   * Mã hoá đơn cho một trang đơn — MỘT câu `IN`, không N+1. Lưới backoffice
   * (cột "Hóa đơn", renderer `invoiceLink`) và lưới mobile đều đọc
   * `invoiceCode`; trước đây chỉ `getById` tra nên cột luôn trống
   * (run_sales_flow.py ghi nhận 2026-09-22).
   */
  private async invoiceCodesOf(
    rows: SalesOrderEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.invoiceId).filter((id): id is string => !!id))];
    if (!ids.length) return new Map();
    const invoices = await this.invoices.find({
      where: { id: In(ids), organizationId },
      select: ['id', 'code'],
    });
    return new Map(invoices.map((inv) => [inv.id, inv.code]));
  }

  private async branchNamesOf(
    rows: SalesOrderEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.branchId).filter((id): id is string => !!id))];
    if (!ids.length) return new Map();

    // `organizationId` vẫn ở mệnh đề WHERE: một `branch_id` của tổ chức khác
    // (không FK nào chặn) phải trả về KHÔNG TÊN, không phải tên của họ.
    const branches = await this.dataSource.getRepository(BranchEntity).find({
      where: { id: In(ids), organizationId },
      select: ['id', 'name'],
    });
    return new Map(branches.map((branch) => [branch.id, branch.name]));
  }

  /**
   * Phân một đơn trong pool về một chi nhánh (AC-09..AC-13).
   *
   * KHÔNG chạm `PosSessionService` và KHÔNG tạo hoá đơn nháp (ADR-02): Admin
   * phân đơn lúc 7h sáng, trước khi bất kỳ chi nhánh nào mở ca, là tình huống
   * thường. `approve()` vẫn là việc của thu ngân và vẫn ném `NO_OPEN_SESSION` —
   * nó chỉ không nằm trên đường điều phối nữa.
   *
   * Trạng thái giữ nguyên `SENT`: phân đơn là giao việc, không phải duyệt.
   */
  async dispatch(id: string, branchId: string, actor: ActorContext): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (current.status !== SalesOrderStatus.SENT) {
        throw new ConflictException({
          code: ORDER_NOT_DISPATCHABLE,
          message: `Đơn hàng không ở trạng thái chờ phân (${current.status})`,
        });
      }

      // Chi nhánh phải thuộc ĐÚNG tổ chức của người bấm. `sales_orders.branch_id`
      // không có FK, nên không có gì dưới tầng này chặn một id chi nhánh của tổ
      // chức khác — và một đơn nằm ở chi nhánh ngoài tổ chức là đơn biến mất.
      const branch = await manager.findOne(BranchEntity, {
        where: { id: branchId, organizationId: actor.organizationId },
        select: ['id'],
      });
      if (!branch) throw new BadRequestException('Chi nhánh không thuộc tổ chức này');

      // Cập nhật CÓ ĐIỀU KIỆN. `current.branchId` đã đọc dưới khoá ở trên, nhưng
      // điều kiện `branch_id IS NULL` mới là thứ quyết định: nó để chính Postgres
      // chọn người thắng khi hai Admin bấm cùng lúc cho hai chi nhánh khác nhau.
      const claimed = await manager
        .createQueryBuilder()
        .update(SalesOrderEntity)
        .set({ branchId })
        .where('id = :id', { id })
        .andWhere('organization_id = :org', { org: actor.organizationId })
        .andWhere('branch_id IS NULL')
        .execute();
      if (!claimed.affected) {
        throw new ConflictException({
          code: ORDER_ALREADY_DISPATCHED,
          message: 'Đơn hàng đã được phân cho một chi nhánh khác',
        });
      }

      // Vết điều phối, trong CÙNG transaction (A-06, AC-12). `toBranchId` bắt
      // buộc với `DISPATCH` — `CHK_sales_order_dispatch_events_shape` ném nếu
      // thiếu. `fromBranchId` luôn NULL ở đây vì lượt update trên chỉ thắng khi
      // đơn còn trong pool.
      await manager.insert(SalesOrderDispatchEventEntity, {
        organizationId: actor.organizationId,
        salesOrderId: id,
        action: SalesOrderDispatchAction.DISPATCH,
        fromBranchId: null,
        toBranchId: branchId,
        actorUserId: actor.userId,
        reason: null,
      });

      this.logger.log(`Sales order ${id} dispatched to branch ${branchId} (org=${actor.organizationId}, by=${actor.userId})`);
    });

    return this.organizationView(id, actor);
  }

  /**
   * Trả một đơn đang ở chi nhánh về POOL (AC-21, AC-22).
   *
   * A-05: trả về = `branch_id := NULL` + một dòng lịch sử, và `status` GIỮ
   * NGUYÊN `SENT`. Không có trạng thái mới trong `sales_order_status_enum`: đơn
   * vẫn đang chờ xử lý, chỉ là chưa ai giữ. Thêm một trạng thái là migration
   * enum cộng sửa `VALID_TRANSITIONS`, cho đúng một thứ mà `branch_id IS NULL`
   * đã nói rồi.
   *
   * Hai quyền cùng mở được đường này, và chúng KHÔNG cùng phạm vi:
   * - {@link SALES_ORDER_PERMISSIONS.dispatch} (cấp tổ chức) — trả về đơn của
   *   bất kỳ chi nhánh nào;
   * - {@link SALES_ORDER_PERMISSIONS.approve} (thu ngân) — CHỈ đơn chi nhánh
   *   mình đang giữ; đơn của chi nhánh khác là 403 {@link ORDER_NOT_HELD_BY_BRANCH}.
   *
   * Mọi phép chặn chạy TRƯỚC lượt ghi đầu tiên, dưới cùng một khoá hàng: một đơn
   * bị từ chối trả về không được để lại nửa dòng lịch sử nào.
   */
  async returnToPool(id: string, reason: string, actor: ActorContext): Promise<SalesOrderView> {
    // Cắt khoảng trắng ở service chứ không chỉ ở DTO: `reason` là cột BẮT BUỘC
    // của dòng `RETURN` theo `CHK_sales_order_dispatch_events_shape`, và một
    // chuỗi trắng lọt xuống đây sẽ thành 500 từ driver thay vì 400 đọc được.
    const trimmed = reason?.trim();
    if (!trimmed) throw new BadRequestException('Lý do trả đơn về pool là bắt buộc');

    // Hỏi quyền TRƯỚC transaction: phép tra này là một lượt đọc DB riêng, và gọi
    // nó trong lúc đang giữ khoá hàng là kéo dài khoá cho một câu trả lời không
    // phụ thuộc vào hàng ấy.
    const canDispatch = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      SALES_ORDER_PERMISSIONS.dispatch,
    );

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      const fromBranchId = current.branchId ?? null;

      // Phân quyền TRƯỚC mọi phép chặn nghiệp vụ: người không được đụng đơn này
      // cũng không được biết nó đã có hoá đơn hay chưa.
      if (!canDispatch && (!fromBranchId || fromBranchId !== actor.branchId)) {
        throw new ForbiddenException({
          code: ORDER_NOT_HELD_BY_BRANCH,
          message: 'Đơn hàng không thuộc chi nhánh đang thao tác',
        });
      }
      if (current.invoiceId) {
        throw new ConflictException({
          code: ORDER_HAS_INVOICE,
          message: 'Đơn hàng đã phát hành hoá đơn, không trả về được',
        });
      }
      if (current.status !== SalesOrderStatus.SENT) {
        throw new ConflictException({
          code: ORDER_NOT_DISPATCHABLE,
          message: `Đơn hàng không ở trạng thái chờ xử lý (${current.status})`,
        });
      }
      if (!fromBranchId) {
        throw new ConflictException({
          code: ORDER_NOT_DISPATCHED,
          message: 'Đơn hàng đang ở pool, chưa phân cho chi nhánh nào',
        });
      }

      // Cập nhật CÓ ĐIỀU KIỆN trên chính chi nhánh vừa đọc được: hai lượt trả
      // song song thì bên thua đổi 0 dòng và KHÔNG ghi vết thứ hai.
      // `() => 'NULL'` là cách TypeORM nhận một giá trị NULL ở `set()` khi cột
      // khai `branchId?: string` (tiền lệ `voucher.service.ts`).
      const released = await manager
        .createQueryBuilder()
        .update(SalesOrderEntity)
        .set({ branchId: () => 'NULL' })
        .where('id = :id', { id })
        .andWhere('organization_id = :org', { org: actor.organizationId })
        .andWhere('branch_id = :from', { from: fromBranchId })
        .execute();
      if (!released.affected) {
        throw new ConflictException({
          code: ORDER_NOT_DISPATCHED,
          message: 'Đơn hàng đã được trả về pool bởi người khác',
        });
      }

      // Vết điều phối, trong CÙNG transaction (A-06). Hình dạng do DB ép:
      // `RETURN` đòi `from_branch_id` và `reason`, và CẤM `to_branch_id`.
      await manager.insert(SalesOrderDispatchEventEntity, {
        organizationId: actor.organizationId,
        salesOrderId: id,
        action: SalesOrderDispatchAction.RETURN,
        fromBranchId,
        toBranchId: null,
        actorUserId: actor.userId,
        reason: trimmed,
      });

      this.logger.log(
        `Sales order ${id} returned to pool from branch ${fromBranchId} (org=${actor.organizationId}, by=${actor.userId})`,
      );
    });

    return this.organizationView(id, actor);
  }

  /**
   * Đọc CHI TIẾT ở phạm vi tổ chức.
   *
   * KHÔNG dùng {@link getById}: đường kia đi qua {@link scopeOf}, vốn thu hẹp về
   * "đơn của mình" cho bất kỳ ai KHÔNG có `pos.sales-order.approve`. Một Admin
   * chỉ cầm quyền điều phối sẽ ăn 404 trên chính đơn vừa phân xong — đúng cái
   * bẫy đã làm chết đường partner ở T-01-03.
   */
  private async organizationView(id: string, actor: ActorContext): Promise<SalesOrderView> {
    const order = await this.orders.findOne({ where: { id, organizationId: actor.organizationId } });
    if (!order) throw new NotFoundException(`Sales order ${id} not found`);
    const lines = await this.lines.find({ where: { salesOrderId: id }, order: { lineNo: 'ASC' } });
    return this.toView(order, lines);
  }

  async getById(id: string, actor: ActorContext): Promise<SalesOrderView> {
    const order = await this.orders.findOne({ where: { id, organizationId: actor.organizationId } });
    const scope = await this.scopeOf(actor);

    if (!order || (scope.salespersonId && !this.isOwn(order, scope.salespersonId, actor))) {
      throw new NotFoundException(`Sales order ${id} not found`);
    }
    if (!scope.salespersonId && order.status === SalesOrderStatus.DRAFT) {
      // Người có quyền duyệt vẫn chỉ thấy đơn lưu tạm CỦA MÌNH.
      const mine = await this.profileIdOf(actor);
      if (!this.isOwn(order, mine ?? '', actor)) throw new NotFoundException(`Sales order ${id} not found`);
    }

    const lines = await this.lines.find({ where: { salesOrderId: id }, order: { lineNo: 'ASC' } });
    const invoice = order.invoiceId
      ? await this.invoices.findOne({
          where: { id: order.invoiceId, organizationId: actor.organizationId },
          select: ['id', 'code', 'isDraft'],
        })
      : null;
    const thumbnails = await this.thumbnailsOf(lines, actor.organizationId);
    return this.toView(order, lines, invoice?.code ?? null, thumbnails, invoice ? invoice.isDraft : null);
  }

  /**
   * `itemId → URL ảnh bìa` cho các dòng đơn. Chủ sở hữu ảnh là mẫu mã cha
   * (`productId ?? id`), cùng luật `imageOwnerOf` của `/mobile/sales-items` —
   * dòng đơn chỉ lưu `item_id` của BIẾN THỂ nên phải tra qua `items`.
   */
  private async thumbnailsOf(lines: SalesOrderLineEntity[], organizationId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!this.mediaQuery || lines.length === 0) return result;

    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const items = await this.items.find({ where: { id: In(itemIds), organizationId }, select: ['id', 'productId'] });
    const ownerOf = new Map(items.map((item) => [item.id, item.productId ?? item.id]));
    const images = await this.mediaQuery.resolvePublicUrls([...new Set(ownerOf.values())], organizationId);

    for (const [itemId, owner] of ownerOf) {
      const url = images.get(owner)?.[0]?.url;
      if (url) result.set(itemId, url);
    }
    return result;
  }

  /**
   * *Nhận xử lý* (thu ngân). Trong CÙNG một giao dịch, đọc có khoá (ADR-32):
   * 1. đơn phải còn `SENT`;
   * 2. chi nhánh của đơn phải có phiên POS đang mở — không có thì 409 mã
   *    `NO_OPEN_SESSION`, đơn KHÔNG đổi trạng thái, app đưa sang màn Mở ca (ADR-31);
   * 3. tạo hoá đơn NHÁP từ dòng đơn (giá, giảm tay + KM đã chốt, khách, NVBH);
   * 4. ghi liên kết hai chiều và `PROCESSED`.
   *
   * Không FK giữa hai bảng: huỷ nháp sau đó chỉ dọn `invoice_id` về null (A-55).
   */
  /// Sửa số điểm DỰ KIẾN của một đơn còn `SENT`.
  ///
  /// Không đi qua {@link update}: đường kia đòi quyền TẠO đơn (của vai tư vấn),
  /// mà thu ngân cũng phải sửa được con số này — khi *Nhận xử lý* bị chặn vì
  /// khách đã tiêu bớt điểm ở nơi khác, sửa tay ngay tại chỗ là lối ra. Nới
  /// quyền của cả đường sửa đơn để phục vụ một trường là cho thu ngân sửa luôn
  /// dòng hàng và giá.
  ///
  /// Không kiểm số dư ở đây: số dư đổi được bất cứ lúc nào giữa bây giờ và lúc
  /// duyệt, nên một phép kiểm tại đây chỉ là một lời hứa hết hạn ngay. Nơi kiểm
  /// THẬT là {@link approve}, dưới khoá hàng thẻ.
  async setPoints(id: string, points: number, actor: ActorContext): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (current.status !== SalesOrderStatus.SENT && current.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      await manager.update(SalesOrderEntity, id, { pointsRedeemed: points });
    });

    return this.getById(id, actor);
  }

  async approve(id: string, actor: ActorContext): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (!VALID_TRANSITIONS[current.status].includes(SalesOrderStatus.PROCESSED)) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      if (!current.branchId) throw new BadRequestException(`Sales order ${id} has no branch`);
      const session = await this.posSessions.findOpenForBranch(current.branchId, actor, manager);
      const lines = await manager.find(SalesOrderLineEntity, { where: { salesOrderId: id }, order: { lineNo: 'ASC' } });

      const dto: CreateInvoiceDto = {
        sessionId: session.id,
        customerId: current.customerId ?? undefined,
        salespersonId: current.salespersonId ?? undefined,
        note: current.note ?? undefined,
        items: lines.map((line, index) => ({
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          // CHỈ giảm tay (ADR-50). Checkout saga coi giảm dòng là giảm tay rồi tự
          // chạy engine KM lại lúc thu; gộp KM của đơn vào đây là trừ KM hai lần
          // (A-87). KM của đơn chỉ còn là con số tư vấn XEM lúc lập đơn — lựa chọn
          // CTKM đi theo đơn qua `selected/excludedProgramIds`.
          // Ghi dạng type/value chứ không chỉ số tiền: pos-web (invoicePayloadMapper)
          // chỉ round-trip `lineDiscountType/Value` khi thu ngân mở "HĐ lưu tạm" rồi
          // Thanh toán — nháp chỉ có `lineDiscount` bị PATCH tính lại giá gốc và khách
          // bị tính dư (đo bằng run_sales_flow.py mục E, 2026-09-22).
          ...(Number(line.manualDiscount) > 0
            ? {
                lineDiscountType: LineDiscountType.AMOUNT,
                lineDiscountValue: Number(line.manualDiscount),
              }
            : {}),
          lineDiscountReason: line.manualDiscountReason || undefined,
          note: line.note ?? undefined,
          sortOrder: index,
        })),
      };
      // Hoá đơn thuộc chi nhánh của ĐƠN, không phải chi nhánh trong header của người bấm.
      const draft = await this.invoiceService.createDraftIn(
        manager,
        dto,
        { ...actor, branchId: current.branchId },
        // Phí giao của ĐƠN sang hoá đơn NGAY LÚC TẠO (ADR-04, AC-17): số thu
        // ngân thấy trên màn Thu tiền và số shipper thu hộ đều là `amount_due`,
        // nên phí phải nằm trong đó từ hàng đầu tiên chứ không ghi đè sau.
        // Không đi qua `CreateInvoiceDto` — dto ấy là body của client, xem
        // `DraftInvoiceServerFields`. `shipping_fee` là numeric ⇒ về dạng CHUỖI.
        { shippingFeeAmount: Number(current.shippingFee ?? 0) },
      );
      // Kênh bán chép sang hoá đơn (T-16-01) — màn Thu tiền đọc/đổi ngay trên hoá đơn.
      await manager.update(InvoiceEntity, draft.id, { salesOrderId: id, salesChannel: current.salesChannel });
      // Điểm DỰ KIẾN của tư vấn → trừ THẬT, ngay tại đây và trong CÙNG
      // transaction với lượt tạo hoá đơn nháp.
      //
      // Thiếu điểm thì ném, và cả lượt duyệt cuộn lại: đơn ở nguyên `SENT`,
      // KHÔNG có hoá đơn nháp nào sinh ra. Đó là nghĩa của "chặn" mà Loc chốt —
      // một lượt duyệt nửa vời để lại đơn đã PROCESSED cạnh một hoá đơn chưa
      // được giảm, và không ai dọn được trạng thái đó.
      //
      // `applyRedemptionIn` chứ không `applyRedemption`: bản kia đọc ghi qua
      // repository, tức một kết nối khác, và nó sẽ chặn trên chính hàng mà
      // transaction này đang khoá.
      const points = Number(current.pointsRedeemed ?? 0);
      if (points > 0) {
        await this.points.applyRedemptionIn(manager, draft.id, points, { ...actor, branchId: current.branchId });
      }

      await manager.update(SalesOrderEntity, id, {
        status: SalesOrderStatus.PROCESSED,
        approvedBy: actor.userId,
        approvedAt: new Date(),
        invoiceId: draft.id,
      });
      this.logger.log(`Sales order ${id} approved → draft invoice ${draft.id} (session=${session.id}, org=${actor.organizationId})`);
    });

    return this.getById(id, actor);
  }

  reject(id: string, reason: string, actor: ActorContext): Promise<SalesOrderView> {
    return this.transition(id, actor, SalesOrderStatus.REJECTED, {
      rejectedBy: actor.userId,
      rejectedAt: new Date(),
      rejectReason: reason.trim(),
    });
  }

  /**
   * Tư vấn huỷ đơn của CHÍNH mình khi còn `DRAFT` hoặc `SENT`, kèm lý do (MISA:
   * hộp thoại "Lý do hủy"). Đơn lưu tạm cũng HUỶ chứ không xoá — Loc chốt
   * 2026-09-13 — nên nó vẫn còn trong lịch sử ở "Đã huỷ".
   */
  /**
   * Huỷ đơn — và nếu đơn đã sinh hoá đơn thì ĐẢO luôn hoá đơn ấy (ADR-06).
   *
   * Không viết đường đảo mới: `CancelInvoiceService.cancel` đã đảo bút toán kho
   * (`INVOICE_CANCEL`), claw back `pointsEarned`, trả lại `pointsRedeemed`, tất
   * toán `invoice_debts` và bắn `invoice.cancelled`. Ở đây chỉ GỌI LẠI nó.
   *
   * CÙNG một transaction, và thứ tự là có chủ đích: cập nhật đơn TRƯỚC, huỷ hoá
   * đơn SAU. `CancelInvoiceService` bắn publisher ngay sau thân transaction của
   * nó — tức trước khi transaction này commit — nên sau lời gọi ấy không được
   * còn việc gì có thể hỏng.
   *
   * Hoá đơn từ chối huỷ (ngoài `CANCELLABLE_STATUSES`, hoặc đã có trả hàng tất
   * toán) ⇒ ném ⇒ rollback ⇒ đơn giữ nguyên trạng thái cũ. "Đơn `CANCELLED` mà
   * hoá đơn còn sống" là trạng thái không được phép tồn tại, và đó chính là lý
   * do `PROCESSED → CANCELLED` mở được ở {@link VALID_TRANSITIONS}.
   */
  async cancel(id: string, reason: string | undefined, actor: ActorContext): Promise<SalesOrderView> {
    // `scopeOf` chứ KHÔNG phải `salespersonOf`: đơn WEB có `salespersonId = NULL`
    // và `createdBy` là shadow user của API key, nên `isOwn` KHÔNG BAO GIỜ đúng
    // với người dùng backoffice — huỷ đơn web sẽ 404 với mọi tài khoản ERP, trái
    // A-14 (người huỷ là người của ERP). `getById` đã dùng đúng lối này: người
    // giữ quyền duyệt nhận `{}` và bỏ qua vòng thu hẹp; tư vấn viên vẫn chỉ huỷ
    // được đơn của mình.
    const scope = await this.scopeOf(actor);
    const trimmed = reason?.trim() || null;

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);

      if (scope.salespersonId && !this.isOwn(current, scope.salespersonId, actor)) {
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (!VALID_TRANSITIONS[current.status].includes(SalesOrderStatus.CANCELLED)) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      await manager.update(SalesOrderEntity, id, {
        status: SalesOrderStatus.CANCELLED,
        cancelledBy: actor.userId,
        cancelledAt: new Date(),
        cancelReason: trimmed,
      });

      // Đơn chưa tới thu ngân thì không có gì để đảo.
      if (current.invoiceId) {
        await this.cancelInvoiceService.cancel(
          current.invoiceId,
          { reason: trimmed ?? 'Huỷ đơn hàng' },
          actor,
          manager,
        );
      }
    });

    return this.getById(id, actor);
  }

  private async transition(
    id: string,
    actor: ActorContext,
    target: SalesOrderStatus,
    patch: Partial<SalesOrderEntity>,
    ownerSalespersonId?: string,
  ): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      // Đọc CÓ KHOÁ: hai thu ngân bấm *Nhận xử lý* cùng lúc không được cùng thắng.
      const current = await this.lockedOrder(manager, id, actor);

      if (ownerSalespersonId && !this.isOwn(current, ownerSalespersonId, actor)) {
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (!VALID_TRANSITIONS[current.status].includes(target)) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      await manager.update(SalesOrderEntity, id, { ...patch, status: target });
    });

    return this.getById(id, actor);
  }

  private async lockedOrder(manager: EntityManager, id: string, actor: ActorContext): Promise<SalesOrderEntity> {
    const order = await manager
      .createQueryBuilder(SalesOrderEntity, 'so')
      .setLock('pessimistic_write')
      .where('so.id = :id AND so.organizationId = :org', { id, org: actor.organizationId })
      .getOne();
    if (!order) throw new NotFoundException(`Sales order ${id} not found`);
    return order;
  }

  /** `{ salespersonId }` khi phải thu hẹp về đơn của mình; `{}` khi thấy cả chi nhánh. */
  private async scopeOf(actor: ActorContext): Promise<{ salespersonId?: string }> {
    // Hai quyền cùng mở TRỌN chi nhánh, vì hai lý do khác nhau:
    // - `approve` là thu ngân: phải thấy mọi đơn gửi tới để nhận xử lý;
    // - `read-all` là người đọc toàn chuỗi (quản lý): thấy được mọi đơn của mọi
    //   chi nhánh ở `/admin/sales-orders` thì bó họ về "đơn của mình" ở đường
    //   này là vô nghĩa — và đó là ca khiến màn chi tiết cửa hàng của app quản
    //   lý trả danh sách RỖNG mà không có lỗi nào.
    const [canApprove, canReadAll] = await Promise.all([
      this.rbac.hasPermission(actor.userId, actor.organizationId, SALES_ORDER_PERMISSIONS.approve),
      this.rbac.hasPermission(actor.userId, actor.organizationId, SALES_ORDER_PERMISSIONS.readAll),
    ]);
    if (canApprove || canReadAll) return {};
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });
    // Không có hồ sơ nhân viên thì không có đơn nào là "của mình" — id giả để
    // truy vấn trả rỗng thay vì trả cả chi nhánh.
    return { salespersonId: profile?.id ?? '00000000-0000-0000-0000-000000000000' };
  }

  private async profileIdOf(actor: ActorContext): Promise<string | undefined> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });
    return profile?.id;
  }

  /** "Của mình" = ghi công bán cho hồ sơ mình, HOẶC do chính mình tạo (gửi giùm người khác). */
  private isOwn(order: SalesOrderEntity, salespersonId: string, actor: ActorContext): boolean {
    return order.salespersonId === salespersonId || order.createdBy === actor.userId;
  }

  /** Nhân viên được CHỌN trên đơn — phải thuộc tổ chức, đang hoạt động, và ở chi nhánh này. */
  private async salespersonById(id: string, actor: ActorContext): Promise<{ id: string; name: string }> {
    const profile = await this.profiles
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'user')
      .innerJoin(UserBranchAssignmentEntity, 'uba', 'CAST(uba.userId AS text) = CAST(user.id AS text) AND CAST(uba.branchId AS text) = :branch', {
        branch: this.branchOf(actor),
      })
      .where('profile.id = :id AND profile.organizationId = :org', { id, org: actor.organizationId })
      .andWhere('user.isActive = true')
      .getOne();
    if (!profile) {
      throw new BadRequestException('Nhân viên bán hàng không thuộc chi nhánh này hoặc đã ngừng hoạt động');
    }
    const name = `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim();
    return { id: profile.id, name: name || 'Nhân viên' };
  }

  private async salespersonOf(actor: ActorContext): Promise<{ id: string; name: string }> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      relations: { user: true },
    });
    if (!profile) {
      throw new BadRequestException('Tài khoản chưa gắn hồ sơ nhân viên nên không gửi được đơn hàng');
    }
    const user = profile.user;
    const name = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';
    return { id: profile.id, name: name || 'Nhân viên' };
  }

  private branchOf(actor: ActorContext): string {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    return actor.branchId;
  }

  private async customerSnapshotOf(customerId: string | undefined, actor: ActorContext) {
    if (!customerId) return null;
    const customer = await this.customers.findOne({
      where: { id: customerId, organizationId: actor.organizationId },
      select: ['id', 'name', 'phone'],
    });
    if (!customer) throw new BadRequestException('Khách hàng không tồn tại trong tổ chức');
    return { id: customer.id, name: customer.name, phone: customer.phone ?? null };
  }

  private async prepareLines(dtoLines: SalesOrderLineDto[], actor: ActorContext) {
    if (!dtoLines?.length) throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');

    const itemIds = [...new Set(dtoLines.map((l) => l.itemId))];
    const found = await this.items.find({
      where: { id: In(itemIds), organizationId: actor.organizationId },
      select: ['id'],
    });
    const missing = itemIds.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) {
      throw new BadRequestException(`Hàng hoá không tồn tại trong tổ chức: ${missing.join(', ')}`);
    }

    let subtotal = 0;
    let discount = 0;
    const lines = dtoLines.map((line, index) => {
      const lineTotal = line.quantity * line.unitPrice;
      const manual = line.manualDiscount ?? 0;
      const promotion = line.promotionDiscount ?? 0;
      if (manual + promotion > lineTotal) {
        throw new BadRequestException(`Giảm giá vượt thành tiền ở dòng ${index + 1}`);
      }
      subtotal += lineTotal;
      discount += manual + promotion;
      return {
        lineNo: index + 1,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        manualDiscount: String(manual),
        manualDiscountReason: line.manualDiscountReason ?? null,
        promotionDiscount: String(promotion),
        promotionName: line.promotionName ?? null,
        note: line.note ?? null,
        lineTotal: String(lineTotal),
      };
    });

    return {
      lines,
      totals: { subtotal: String(subtotal), discount: String(discount), amountDue: String(subtotal - discount) },
    };
  }

  private toView(
    order: SalesOrderEntity,
    lines: SalesOrderLineEntity[],
    invoiceCode: string | null = null,
    thumbnails: Map<string, string> = new Map(),
    invoiceIsDraft: boolean | null = null,
  ): SalesOrderView {
    return {
      id: order.id,
      code: order.documentNumber,
      status: order.status,
      createdAt: order.createdAt,
      salespersonId: order.salespersonId,
      salespersonName: order.salespersonName,
      salesChannel: order.salesChannel,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      amountDue: Number(order.amountDue),
      // Tiền về từ `numeric` dưới dạng CHUỖI, như `subtotal`/`discount`/`amountDue`.
      // `?? 0` cho đơn mobile ghi trước khi cột này tồn tại.
      shippingFee: Number(order.shippingFee ?? 0),
      recipientName: order.recipientName ?? null,
      recipientPhone: order.recipientPhone ?? null,
      // TÊN đã snapshot, đọc thẳng từ đơn — không tra lại `geo_*` (ADR-05, AC-03).
      shipProvinceName: order.shipProvinceName ?? null,
      shipWardName: order.shipWardName ?? null,
      shipAddressLine: order.shipAddressLine ?? null,
      externalOrderId: order.externalOrderId ?? null,
      salesChannelId: order.salesChannelId ?? null,
      pointsRedeemed: Number(order.pointsRedeemed ?? 0),
      selectedProgramIds: order.selectedProgramIds ?? [],
      excludedProgramIds: order.excludedProgramIds ?? [],
      note: order.note,
      rejectReason: order.rejectReason,
      cancelReason: order.cancelReason,
      invoiceId: order.invoiceId ?? null,
      invoiceCode,
      invoiceIsDraft,
      lines: lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        code: line.itemCode,
        name: line.itemName,
        unit: line.unit,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        manualDiscount: Number(line.manualDiscount),
        manualDiscountReason: line.manualDiscountReason,
        promotionDiscount: Number(line.promotionDiscount),
        promotionName: line.promotionName,
        note: line.note,
        lineTotal: Number(line.lineTotal),
        thumbnailUrl: thumbnails.get(line.itemId) ?? null,
      })),
    };
  }
}

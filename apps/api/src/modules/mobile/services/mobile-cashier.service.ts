import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CashAccountEntity, CashAccountType } from '../../accounting/cash/cash-account.entity';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';
import { PosSessionService } from '../../pos/services/pos-session.service';
import { InvoiceService } from '../../pos/services/invoice.service';
import { CheckoutSagaRunner } from '../../pos/checkout-saga/application/checkout-saga.runner';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { PaymentAccountEntity } from '../../accounting/payment-accounts/payment-account.entity';
import { MobileCheckoutDto, MobileCheckoutPreviewDto } from '../dto/mobile-checkout.dto';
import { MobileCollectDebtDto, MobileDebtPaymentMethod, MobileDebtorsQueryDto } from '../dto/mobile-debt.dto';
import { PartnerLookupService } from '../../accounting/cash-vouchers/shared/partner-lookup.service';
import { DebtCollectionSagaService } from '../../accounting/cash-vouchers/debt-collection/debt-collection-saga.service';
import { DepositDebtCollectionSagaService } from '../../accounting/deposit-vouchers/debt-collection/deposit-debt-collection-saga.service';
import { CashVoucherPartnerType } from '../../accounting/cash-vouchers/enums';
import { BankVoucherPartnerType } from '../../accounting/deposit-vouchers/enums';
import { QueryBus } from '@nestjs/cqrs';
import { SearchReturnableInvoicesV2Query } from '../../pos/queries/search-returnable-invoices-v2.query';
import { ReturnableInvoiceSearchV2Dto } from '../../pos/dto/returnable-invoice-search-v2.dto';
import { StringOperator } from '../../../common/filters/filter.dto';
import { ReturnEligibilityService } from '../../pos/services/return-eligibility.service';
import { CreateReturnInvoiceService } from '../../pos/services/create-return-invoice.service';
import { CreateExchangeInvoiceService } from '../../pos/services/create-exchange-invoice.service';
import { CheckoutReturnService } from '../../pos/services/checkout-return.service';
import { ReturnInvoiceMode } from '../../pos/dto/create-return-invoice.dto';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { RefundMethod } from '../../pos/entities/invoice.entity';
import { MobileExchangeDto, MobileRefundMethod, MobileReturnableQueryDto } from '../dto/mobile-exchange.dto';
import { GetPosDailySummaryQuery } from '../../reporting/pos-daily-report/queries/get-pos-daily-summary.query';
import { PosDailySummaryDto } from '../../reporting/pos-daily-report/dto/pos-daily-summary.dto';
import type { AppliedProgram, LineDiscount, PosDailySummaryResult } from '@erp/shared-interfaces';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { SalesOrderEntity } from '../../sales-order/entities/sales-order.entity';
import { MobileCreateDraftDto, MobileUpdateDraftDto } from '../dto/mobile-cashier-draft.dto';
import { SessionStatus } from '@erp/shared-interfaces';
import { MobileCloseShiftDto, MobileOpenShiftDto } from '../dto/mobile-session.dto';

/** Hoá đơn NHÁP dưới hình dạng GIỎ của app (T-15-01) — thứ màn Thu tiền đọc và sửa. */
export interface MobileDraftView {
  invoiceId: string;
  invoiceCode: string;
  salesOrderId: string | null;
  salesOrderCode: string | null;
  customer: { id: string; name: string; phone: string | null; outstandingDebt: number } | null;
  salesperson: { id: string; name: string | null } | null;
  /** Kênh bán ghi trên ĐƠN gốc; `null` = tại cửa hàng (A-65). */
  salesChannel: string | null;
  note: string | null;
  lines: Array<{
    /**
     * `invoice_items.id` — khoá để app ghép `lineDiscounts[].lineId` của preview
     * saga vào đúng dòng giỏ. `itemId` không dùng được: một mã hàng có thể nằm
     * trên hai dòng (khác giá / khác ghi chú).
     */
    id: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    lineDiscount: number;
    lineDiscountReason: string | null;
    lineTotal: number;
    note: string | null;
  }>;
  subtotal: number;
  discount: number;
  /**
   * Điểm tích luỹ ĐÃ TRỪ trên hoá đơn nháp này, và tiền quy đổi của nó.
   *
   * Phải có mặt ở đây chứ không chỉ ở đường `POST/DELETE .../points`: một bản
   * nháp được ĐỌC LẠI nhiều hơn là được ghi — thu ngân mở lại giỏ đã lưu, và
   * *Nhận xử lý* nạp giỏ từ hoá đơn nháp mà `SalesOrderService.approve` vừa
   * trừ điểm. Thiếu hai trường này thì giỏ bày lại đúng số tiền CHƯA trừ
   * (đo 2026-09-15: hoá đơn `amount_due` 524.000, giỏ bày 525.000) và dòng
   * *Điểm (N)* biến mất, trong khi điểm của khách thì đã bị trừ thật.
   */
  pointsRedeemed: number;
  pointsDiscountAmount: number;
  amountDue: number;
  /**
   * Lựa chọn CTKM tư vấn đã chốt trên ĐƠN gốc (ADR-52) — giỏ nạp làm trạng thái
   * ban đầu rồi gửi theo preview/checkout. Nháp giỏ tự dựng (không có đơn) → `[]`.
   * Thu ngân sửa trong giỏ KHÔNG ghi ngược lại đơn (A-97).
   */
  selectedProgramIds: string[];
  excludedProgramIds: string[];
}

export interface MobileCashierSessionView {
  open: boolean;
  session: {
    id: string;
    status: SessionStatus;
    cashAccountId: string | null;
    openedBy: string;
    openedAt: Date;
    openingCashAmount: number;
    /** Chỉ có khi phiên đang CLOSING (màn Đóng ca đã mở): "Tiền thu trong ca" server tính. */
    expectedCash?: number;
  } | null;
}

export interface MobileCashAccountView {
  id: string;
  name: string;
}

/**
 * Vai THU NGÂN của erp_sales (`/mobile/cashier/*`, feature `erp-sales-cashier`).
 *
 * Mọi thứ ở đây BỌC service POS đã có (`PosSessionService`, `InvoiceService`,
 * checkout saga v2 qua `CheckoutSagaRunner`, saga thu nợ, `CheckoutReturnService`) với hai điều
 * mà đường POS web không có: phiên POS tự tra theo chi nhánh (ADR-31) và số
 * trả về là `number` chứ không phải chuỗi `numeric` của TypeORM — bài học
 * `numbersOf` của `mobile-invoice.service`.
 *
 * Phiên ưu tiên phiên do CHÍNH người gọi mở (cùng luật với
 * `PosSessionService.findOpenForBranch`), để hai két cùng chi nhánh không
 * lẫn ca của nhau.
 */
@Injectable()
export class MobileCashierService {
  private readonly logger = new Logger(MobileCashierService.name);

  constructor(
    @InjectRepository(PosSessionEntity)
    private readonly sessions: Repository<PosSessionEntity>,
    @InjectRepository(CashAccountEntity)
    private readonly cashAccountRepo: Repository<CashAccountEntity>,
    private readonly posSessions: PosSessionService,
    private readonly invoices: InvoiceService,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profiles: Repository<EmployeeProfileEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly salesOrders: Repository<SalesOrderEntity>,
    private readonly dataSource: DataSource,
    private readonly checkoutRunner: CheckoutSagaRunner,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccountRepo: Repository<PaymentAccountEntity>,
    private readonly partnerLookup: PartnerLookupService,
    private readonly cashDebtCollection: DebtCollectionSagaService,
    private readonly bankDebtCollection: DepositDebtCollectionSagaService,
    private readonly queryBus: QueryBus,
    private readonly returnEligibility: ReturnEligibilityService,
    private readonly createReturn: CreateReturnInvoiceService,
    private readonly createExchange: CreateExchangeInvoiceService,
    private readonly checkoutReturn: CheckoutReturnService,
  ) {}

  private requireBranch(actor: ActorContext): string {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    return actor.branchId;
  }

  /** Két quầy (`REGISTER`) đang hoạt động của chi nhánh — ô *Két tiền* của màn Mở ca. */
  async cashAccounts(actor: ActorContext): Promise<MobileCashAccountView[]> {
    const rows = await this.cashAccountRepo.find({
      where: { organizationId: actor.organizationId, branchId: this.requireBranch(actor), type: CashAccountType.REGISTER },
      order: { name: 'ASC' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  /** Mở ca = `open` + `start-sales` trong MỘT lượt: app không có khái niệm "đã mở nhưng chưa bán". */
  async openShift(dto: MobileOpenShiftDto, actor: ActorContext): Promise<MobileCashierSessionView> {
    const opened = await this.posSessions.openSession(
      { branchId: this.requireBranch(actor), cashAccountId: dto.cashAccountId, openingCashAmount: dto.openingCashAmount },
      actor,
    );
    await this.posSessions.startSales(opened.id, actor);
    return this.session(actor);
  }

  /**
   * Mở màn Đóng ca: chuyển phiên sang CLOSING để server tính "Tiền thu trong ca".
   * HỦY BỎ ở màn đó gọi [reopen]; ĐỒNG Ý gọi [closeShift].
   */
  async startClose(actor: ActorContext): Promise<MobileCashierSessionView> {
    const current = await this.session(actor);
    if (!current.session) throw new ConflictException({ code: 'NO_OPEN_SESSION', message: 'Chi nhánh chưa mở ca.' });
    if (current.session.status === SessionStatus.CLOSING) return current;
    await this.posSessions.startClose(current.session.id, actor);
    return this.session(actor);
  }

  /** HỦY BỎ của màn Đóng ca (A-68): ca về đang bán. */
  async reopen(actor: ActorContext): Promise<MobileCashierSessionView> {
    const closing = await this.sessions.findOne({
      where: { organizationId: actor.organizationId, branchId: this.requireBranch(actor), status: SessionStatus.CLOSING },
      order: { openedAt: 'DESC' },
    });
    if (closing) await this.posSessions.reopen(closing.id, actor);
    return this.session(actor);
  }

  /**
   * ĐỒNG Ý của màn Đóng ca: nộp kiểm kê rồi đóng. Lệch quá ngưỡng → 409
   * `VARIANCE_NEEDS_APPROVAL`, phiên ở CLOSING chờ quản lý (thu ngân không có
   * `pos.session.approve_variance`).
   */
  async closeShift(dto: MobileCloseShiftDto, actor: ActorContext): Promise<{ closed: boolean; variance: number }> {
    const current = await this.session(actor);
    if (!current.session) throw new ConflictException({ code: 'NO_OPEN_SESSION', message: 'Chi nhánh chưa mở ca.' });
    let id = current.session.id;
    if (current.session.status !== SessionStatus.CLOSING) {
      await this.posSessions.startClose(id, actor);
    }
    const reconciliation = await this.posSessions.submitReconciliation(id, { actualCash: dto.actualCash, notes: dto.notes }, actor);
    if (!reconciliation.varianceApproved) {
      throw new ConflictException({
        code: 'VARIANCE_NEEDS_APPROVAL',
        message: `Chênh lệch ${Number(reconciliation.variance).toLocaleString('vi-VN')} đ — cần quản lý duyệt trước khi đóng ca`,
        variance: Number(reconciliation.variance),
      });
    }
    await this.posSessions.finalizeClose(id, actor);
    return { closed: true, variance: Number(reconciliation.variance) };
  }

  /** Phiên đang mở của chi nhánh trong `X-Branch-Id` — app hỏi TRƯỚC khi cho bấm Thu tiền. */
  async session(actor: ActorContext): Promise<MobileCashierSessionView> {
    const open = await this.sessions.find({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        // CLOSING vẫn là "có ca": màn Đóng ca đang mở dở; app cần biết để HỦY BỎ (reopen).
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES, SessionStatus.CLOSING]),
      },
      order: { openedAt: 'DESC' },
    });
    const session = open.find((s) => s.openedBy === actor.userId) ?? open[0] ?? null;
    if (!session) return { open: false, session: null };
    const expectedCash =
      session.status === SessionStatus.CLOSING ? Number(await this.posSessions.expectedCashOf(session)) : undefined;
    return {
      open: true,
      session: {
        id: session.id,
        status: session.status,
        cashAccountId: session.cashAccountId ?? null,
        openedBy: session.openedBy,
        openedAt: session.openedAt,
        openingCashAmount: Number(session.openingCashAmount ?? 0),
        ...(expectedCash === undefined ? {} : { expectedCash }),
      },
    };
  }
  /**
   * Hoá đơn nháp → hình dạng giỏ. 400 khi hoá đơn đã checkout (không còn nháp):
   * giỏ thu ngân chỉ có nghĩa với nháp; tờ đã thu tiền đi đường `/mobile/invoices/:id`.
   */
  async draft(invoiceId: string, actor: ActorContext): Promise<MobileDraftView> {
    const invoice = await this.invoices.findOneWithItems(invoiceId, actor);
    if (!invoice.isDraft) {
      throw new BadRequestException(`Hoá đơn ${invoice.code} đã thu tiền, không còn là nháp`);
    }

    const order = invoice.salesOrderId
      ? await this.salesOrders.findOne({
          where: { id: invoice.salesOrderId, organizationId: actor.organizationId },
          select: ['id', 'documentNumber', 'salesChannel', 'selectedProgramIds', 'excludedProgramIds'],
        })
      : null;

    const customer = invoice.customer;
    // `products.id` của từng dòng — app kiểm tồn theo chi nhánh trước khi thu (AC-75 áp cho Thu tiền,
    // Loc rà 2026-09-14: "Hoàn thành chưa thấy cảnh báo xuất quá tồn"). Hàng lẻ không có mẫu mã → null.
    const itemIds = [...new Set(invoice.items.map((item) => item.itemId))];
    const modelByItem = new Map<string, string | null>();
    if (itemIds.length > 0) {
      const items = await this.dataSource
        .getRepository(ItemEntity)
        .find({ where: { id: In(itemIds) }, select: ['id', 'productId'] });
      for (const item of items) modelByItem.set(item.id, item.productId ?? null);
    }
    const lines = [...invoice.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        itemId: item.itemId,
        modelId: modelByItem.get(item.itemId) ?? null,
        itemCode: item.itemCode,
        itemName: item.itemName,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineDiscount: Number(item.lineDiscount) + Number(item.promotionDiscount),
        lineDiscountReason: item.lineDiscountReason ?? null,
        lineTotal: Number(item.lineTotal),
        note: item.note ?? null,
      }));

    return {
      invoiceId: invoice.id,
      invoiceCode: invoice.code,
      salesOrderId: order?.id ?? null,
      salesOrderCode: order?.documentNumber ?? null,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? null,
            outstandingDebt: await this.outstandingDebtOf(customer.id, actor),
          }
        : null,
      salesperson: invoice.salespersonId
        ? { id: invoice.salespersonId, name: await this.salespersonNameOf(invoice.salespersonId, actor) }
        : null,
      // Cột trên hoá đơn (T-16-01) thắng; nháp cũ sinh trước cột thì đọc từ đơn.
      salesChannel: invoice.salesChannel ?? order?.salesChannel ?? null,
      note: invoice.note ?? null,
      lines,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discountAmount),
      pointsRedeemed: Number(invoice.pointsRedeemed ?? 0),
      pointsDiscountAmount: Number(invoice.pointsDiscountAmount ?? 0),
      amountDue: Number(invoice.amountDue),
      selectedProgramIds: order?.selectedProgramIds ?? [],
      excludedProgramIds: order?.excludedProgramIds ?? [],
    };
  }

  /**
   * Lập hoá đơn NHÁP từ giỏ thu ngân dựng trên màn Bán hàng (không qua đơn tư vấn).
   * Cùng khuôn `SalesOrderService.approve`: cần ca đang mở (409 `NO_OPEN_SESSION`
   * khi chưa có), `createDraftIn` trong một giao dịch, kênh bán ghi cột riêng. Trả
   * về đúng hình dạng `draft()` để app đi thẳng sang màn Thu tiền.
   */
  async createDraft(dto: MobileCreateDraftDto, actor: ActorContext): Promise<MobileDraftView> {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    const session = await this.posSessions.findOpenForBranch(actor.branchId, actor);
    const id = await this.dataSource.transaction(async (manager) => {
      const draft = await this.invoices.createDraftIn(
        manager,
        {
          sessionId: session.id,
          customerId: dto.customerId,
          salespersonId: dto.salespersonId,
          note: dto.note,
          items: dto.lines.map((line, index) => ({
            itemId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineDiscount: line.lineDiscount ?? 0,
            lineDiscountReason: line.lineDiscountReason,
            note: line.note,
            sortOrder: index,
          })),
        },
        actor,
      );
      if (dto.salesChannel) {
        await manager.update(InvoiceEntity, draft.id, { salesChannel: dto.salesChannel });
      }
      return draft.id;
    });
    this.logger.log(`Cashier cart → draft invoice ${id} (session=${session.id}, org=${actor.organizationId})`);
    return this.draft(id, actor);
  }

  /** Sửa nháp từ giỏ: dòng / khách / NVBH / ghi chú qua `InvoiceService.update`; kênh bán ghi cột `invoices.sales_channel`. */
  async updateDraft(invoiceId: string, dto: MobileUpdateDraftDto, actor: ActorContext): Promise<MobileDraftView> {
    const invoice = await this.invoices.findOne(invoiceId, actor);
    if (!invoice.isDraft) {
      throw new BadRequestException(`Hoá đơn ${invoice.code} đã thu tiền, không sửa được nữa`);
    }

    await this.invoices.update(
      invoiceId,
      {
        customerId: dto.customerId,
        salespersonId: dto.salespersonId,
        note: dto.note,
        items: dto.lines?.map((line, index) => ({
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineDiscount: line.lineDiscount,
          lineDiscountReason: line.lineDiscountReason,
          note: line.note,
          sortOrder: index,
        })),
      },
      actor,
    );

    if (dto.salesChannel !== undefined) {
      await this.dataSource.getRepository(InvoiceEntity).update(
        { id: invoiceId, organizationId: actor.organizationId },
        { salesChannel: dto.salesChannel || null },
      );
    }

    return this.draft(invoiceId, actor);
  }

  /** Tổng `remaining_amount` các khoản nợ CHƯA TRẢ (`open` + `overdue`, enum `debt_status_enum` chữ thường) — cùng bảng với thu nợ (UOW-16). */
  private async outstandingDebtOf(customerId: string, actor: ActorContext): Promise<number> {
    const rows: Array<{ total: string | null }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(remaining_amount), 0) AS total
         FROM invoice_debts
        WHERE organization_id::text = $1 AND customer_id::text = $2 AND status IN ('open', 'overdue')`,
      [actor.organizationId, customerId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  private async salespersonNameOf(salespersonId: string, actor: ActorContext): Promise<string | null> {
    const profile = await this.profiles.findOne({
      where: { id: salespersonId, organizationId: actor.organizationId },
      relations: { user: true },
    });
    const user = profile?.user;
    if (!user) return null;

    return `${user.firstName} ${user.lastName}`.trim() || null;
  }
  /** Tài khoản nhận tiền chuyển khoản/thẻ của chi nhánh (hoặc dùng chung toàn tổ chức), đang hoạt động. */
  async paymentAccounts(actor: ActorContext): Promise<Array<{ id: string; label: string; paymentMethod: string; branchId: string | null }>> {
    const rows = await this.paymentAccountRepo
      .createQueryBuilder('pa')
      .where('pa.organizationId = :org', { org: actor.organizationId })
      .andWhere('pa.isActive = true')
      .andWhere('(pa.branchId IS NULL OR pa.branchId = :branch)', { branch: actor.branchId ?? null })
      .orderBy('pa.sortOrder', 'ASC')
      .addOrderBy('pa.label', 'ASC')
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      label: r.label ?? r.paymentMethod,
      paymentMethod: r.paymentMethod,
      branchId: r.branchId ?? null,
    }));
  }

  /**
   * Thu tiền hoá đơn nháp. Từ T-03-02 đi checkout saga v2 — ĐÚNG đường POS web
   * đang chạy (ADR-49) — qua `CheckoutSagaRunner`, không qua v1
   * (`CheckoutInvoiceService`) nữa: v1 không ghi `invoice_checkout_promotions`,
   * nên hoá đơn mobile thiếu CTKM đã áp. Số hoá đơn, sổ quỹ, công nợ, điểm, kho,
   * outbox đều do saga làm; ở đây không có tác dụng phụ nào sau commit — v1
   * cũng không có cái nào riêng cho mobile (không đụng đơn tư vấn).
   *
   * Kênh bán (nếu gửi) vẫn ghi TRƯỚC, ngoài transaction của saga, để tờ hoá
   * đơn phát hành mang kênh — như trước.
   *
   * `idempotencyKey` mặc định là `invoiceId`, giống controller web: gửi lại
   * cùng một lượt thu (mất phản hồi) không bao giờ thành hai lần thu.
   *
   * Hình dạng trả về GIỮ NGUYÊN như thời v1 (`CheckoutResultModel` của app đọc
   * đúng các khoá này). Đọc lại hoá đơn sau commit thay vì dựng từ
   * `result.totals`: `salesOrderId` không có trong kết quả saga, và cột đã
   * lưu là thứ app sẽ thấy lại ở `GET /mobile/invoices/:id` — trả cùng một
   * nguồn thì hai màn không thể lệch nhau.
   */
  async checkout(invoiceId: string, dto: MobileCheckoutDto, idempotencyKey: string | undefined, actor: ActorContext) {
    const invoice = await this.invoices.findOne(invoiceId, actor);
    if (!invoice.isDraft) {
      throw new BadRequestException(`Hoá đơn ${invoice.code} đã thu tiền rồi`);
    }
    if (dto.salesChannel !== undefined) {
      await this.dataSource.getRepository(InvoiceEntity).update(
        { id: invoiceId, organizationId: actor.organizationId },
        { salesChannel: dto.salesChannel || null },
      );
    }

    const key = idempotencyKey || invoiceId;
    await this.checkoutRunner.run(
      {
        invoiceId,
        payments: dto.payments.map((line) => ({
          paymentMethod: line.method,
          amount: line.amount,
          paymentAccountId: line.paymentAccountId,
        })),
        dueDate: dto.dueDate,
        keptChangeAmount: dto.keptChangeAmount,
        selectedProgramIds: dto.selectedProgramIds,
        excludedProgramIds: dto.excludedProgramIds,
      },
      { idempotencyKey: key, correlationId: key },
      actor,
    );

    const issued = await this.invoices.findOne(invoiceId, actor);
    return {
      invoiceId: issued.id,
      invoiceCode: issued.code,
      status: issued.status,
      amountDue: Number(issued.amountDue),
      totalPaid: Number(issued.totalPaid),
      remainder: Number(issued.amountDue) - Number(issued.totalPaid),
      salesOrderId: issued.salesOrderId ?? null,
    };
  }

  /**
   * Số phải thu của hoá đơn nháp theo saga, trước khi thu (ADR-51) — màn Thu
   * tiền đọc `amountDue` từ đây thay vì tự cộng trừ (A-95: giảm tay % lệch).
   * Không mở transaction, không ghi gì (xem `CheckoutSagaRunner.preview`).
   *
   * Tổng phẳng ở cấp gốc; `appliedPrograms` cắt còn đúng thứ app bày — bỏ
   * `gifts`/`priority`/`discountMode` của engine để hợp đồng với app nhỏ và
   * không đổi theo engine. `lineDiscounts[].lineId` là `invoice_items.id`.
   */
  async previewCheckout(invoiceId: string, dto: MobileCheckoutPreviewDto, actor: ActorContext) {
    const preview = await this.checkoutRunner.preview(
      {
        invoiceId,
        selectedProgramIds: dto.selectedProgramIds,
        excludedProgramIds: dto.excludedProgramIds,
      },
      actor,
    );

    return {
      ...preview.totals,
      appliedPrograms: (preview.appliedPrograms as AppliedProgram[]).map((p) => ({
        programId: p.programId,
        code: p.code,
        name: p.name,
        type: p.type,
        discountAmount: Number(p.discountAmount),
        lineDiscounts: (p.lineDiscounts ?? []).map((ld: LineDiscount) => ({
          lineId: ld.lineId,
          discountAmount: Number(ld.discountAmount),
        })),
      })),
    };
  }
  /** Khách còn nợ — cùng truy vấn với phiếu thu của web, thêm SĐT và sắp xếp (T-17-01). */
  async debtors(query: MobileDebtorsQueryDto, actor: ActorContext) {
    const result = await this.partnerLookup.customersWithDebt(
      { search: query.search, sort: query.sort, page: query.page, pageSize: query.pageSize },
      actor,
    );

    return {
      data: result.data.map((d) => ({
        customerId: d.customerId,
        name: d.customerName,
        code: d.customerCode,
        phone: d.customerPhone,
        debtCount: d.debtCount,
        totalRemaining: d.totalRemaining,
        hasOverdue: d.hasOverdue,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  /** Các khoản nợ CHƯA TRẢ của một khách, kèm số hoá đơn — bảng tick của màn Thu nợ. */
  async debtsOf(customerId: string, actor: ActorContext) {
    const rows: Array<{
      id: string;
      invoice_id: string;
      invoice_code: string | null;
      reference_code: string;
      original_amount: string;
      paid_amount: string;
      remaining_amount: string;
      issued_at: string;
      due_date: string | null;
      status: string;
    }> = await this.dataSource.query(
      `SELECT d.id, d.invoice_id, i.code AS invoice_code, d.reference_code,
              d.original_amount, d.paid_amount, d.remaining_amount,
              d.issued_at::text AS issued_at, d.due_date::text AS due_date, d.status
         FROM invoice_debts d
         LEFT JOIN invoices i ON i.id = d.invoice_id
        WHERE d.organization_id::text = $1 AND d.customer_id::text = $2 AND d.status IN ('open', 'overdue')
        ORDER BY d.issued_at ASC, d.id ASC`,
      [actor.organizationId, customerId],
    );
    // `issued_at`/`due_date` là cột DATE: ép `::text` để về "2026-09-14" thay vì
    // một JS Date nửa đêm giờ máy chủ ("2026-09-13T17:00:00.000Z") — app đọc UTC
    // và bày "17:00 - 13/09" cho một hoá đơn lập ngày 14/09.
    const data = rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoice_id,
      invoiceCode: r.invoice_code ?? r.reference_code,
      originalAmount: Number(r.original_amount),
      paidAmount: Number(r.paid_amount),
      remainingAmount: Number(r.remaining_amount),
      issuedAt: r.issued_at,
      dueDate: r.due_date,
      overdue: r.status === 'overdue',
    }));

    return { data, totalRemaining: data.reduce((sum, d) => sum + d.remainingAmount, 0) };
  }

  /**
   * Thu nợ: tiền mặt → saga phiếu thu (két = két của ca đang mở; chưa mở ca thì
   * `NO_OPEN_SESSION` như mọi thao tác cần ca); chuyển khoản → saga phiếu thu
   * ngân hàng vào tài khoản nhận đã chọn. Một lượt bấm = một `idempotencyKey`.
   */
  async collectDebt(dto: MobileCollectDebtDto, idempotencyKey: string, actor: ActorContext) {
    const allocations = dto.allocations.map((a) => ({ invoiceDebtId: a.invoiceDebtId, amount: a.amount }));
    const today = new Date().toISOString();

    if (dto.paymentMethod === MobileDebtPaymentMethod.CASH) {
      if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
      const session = await this.posSessions.findOpenForBranch(actor.branchId, actor);
      const result = await this.cashDebtCollection.collect(
        {
          voucherDate: today,
          partnerType: CashVoucherPartnerType.CUSTOMER,
          partnerId: dto.customerId,
          reason: dto.note,
          cashAccountId: session.cashAccountId ?? undefined,
          allocations,
        },
        idempotencyKey,
        actor,
      );
      return { receiptId: result.receiptId, code: result.documentNumber, total: result.totalAmount, paymentMethod: dto.paymentMethod };
    }

    if (!dto.paymentAccountId) throw new BadRequestException('Chuyển khoản phải chọn tài khoản nhận');
    const account = await this.paymentAccountRepo.findOne({
      where: { id: dto.paymentAccountId, organizationId: actor.organizationId },
    });
    if (!account?.depositAccountId) {
      throw new BadRequestException('Tài khoản nhận chưa gắn tài khoản ngân hàng (deposit account)');
    }
    const result = await this.bankDebtCollection.collect(
      {
        docDate: today,
        depositAccountId: account.depositAccountId,
        partnerType: BankVoucherPartnerType.CUSTOMER,
        partnerId: dto.customerId,
        reason: dto.note,
        allocations,
      },
      idempotencyKey,
      actor,
    );
    return { receiptId: result.receiptId, code: result.documentNumber, total: result.totalAmount, paymentMethod: dto.paymentMethod };
  }
  /**
   * Hoá đơn đủ điều kiện đổi trả (T-18-01, AC-70): bọc `returnable/search` v2 —
   * kỳ vào `createdAt`, ô tìm rẽ theo hình dạng: toàn số dài (≥ 9) là SĐT, toàn
   * số là số HĐ, còn lại là tên khách. Phạm vi chi nhánh do query v2 áp theo actor.
   */
  async returnableInvoices(query: MobileReturnableQueryDto, actor: ActorContext) {
    const term = query.search?.trim();
    const dto = new ReturnableInvoiceSearchV2Dto();
    dto.page = query.page ?? 1;
    dto.limit = query.limit ?? 20;
    if (query.from || query.to) dto.createdAt = { from: query.from, to: query.to };
    if (term) {
      const filter = { operator: StringOperator.CONTAINS, value: term };
      if (/^\d{9,}$/.test(term)) dto.customerPhone = filter;
      else if (/^\d+$/.test(term)) dto.code = filter;
      else dto.customerName = filter;
    }
    const result: {
      data: Array<InvoiceEntity & { items?: InvoiceItemEntity[]; customer?: { name?: string; phone?: string } | null }>;
      total: number;
      page: number;
      limit: number;
      totals?: { totalAmount: number };
    } = await this.queryBus.execute(new SearchReturnableInvoicesV2Query(dto, actor));

    return {
      data: result.data.map((inv) => ({
        id: inv.id,
        code: inv.code,
        createdAt: inv.createdAt,
        customerName: inv.customer?.name ?? null,
        customerPhone: inv.customer?.phone ?? null,
        amountDue: Number(inv.amountDue),
        totalPaid: Number(inv.totalPaid),
        itemCount: inv.items?.length ?? 0,
      })),
      total: result.total,
      // Tổng tiền TOÀN KỲ (server tính cùng truy vấn dựng danh sách) — thanh "Tổng [n] … tiền" ở đầu màn (AC-70).
      totalAmount: result.totals?.totalAmount ?? 0,
      page: result.page,
      limit: result.limit,
    };
  }

  /** Chi tiết để chọn hàng trả: dòng gốc + số còn trả được + nợ còn trên HĐ gốc (AC-71, AC-74). */
  async returnableDetail(invoiceId: string, actor: ActorContext) {
    const [invoice, lines, debt] = await Promise.all([
      this.invoices.findOneWithItems(invoiceId, actor),
      this.returnEligibility.getEligibleLines(invoiceId, actor),
      this.returnEligibility.getOutstandingDebt(invoiceId, actor),
    ]);

    return {
      id: invoice.id,
      code: invoice.code,
      createdAt: invoice.createdAt,
      customer: invoice.customer ? { id: invoice.customer.id, name: invoice.customer.name, phone: invoice.customer.phone ?? null } : null,
      lines: lines.map((l) => ({
        originalInvoiceItemId: l.originalInvoiceItemId,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unit: l.unit,
        unitPrice: Number(l.unitPrice),
        refundableUnitPrice: Number(l.refundableUnitPrice),
        soldQuantity: Number(l.soldQuantity),
        returnedQuantity: Number(l.returnedQuantity),
        allowedQty: Number(l.maxReturnable),
      })),
      outstandingDebt: Number(debt.remainingDebt),
    };
  }

  /**
   * Đổi trả một lượt (AC-72..76): tạo phiếu trả (`returns`) hay phiếu đổi
   * (`exchanges` khi có mua thêm) rồi `checkout-return` — đúng hai bước của POS,
   * không dựng đường tính tiền thứ hai. Nợ còn trên HĐ gốc bị trừ TRƯỚC
   * (`offsetAmount`, A-62); phần trả khách còn lại đi tiền mặt (két của ca) hay
   * chuyển khoản (tài khoản đã chọn).
   */
  async exchange(dto: MobileExchangeDto, actor: ActorContext) {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    const session = await this.posSessions.findOpenForBranch(actor.branchId, actor);
    const eligible = await this.returnEligibility.getEligibleLines(dto.originalInvoiceId, actor);
    const byItem = new Map(eligible.map((l) => [l.originalInvoiceItemId, l]));

    const returnLines = dto.returnLines.map((line) => {
      const source = byItem.get(line.originalInvoiceItemId);
      if (!source) throw new BadRequestException(`Dòng ${line.originalInvoiceItemId} không thuộc hoá đơn gốc hoặc không còn trả được`);
      if (line.quantity > source.maxReturnable) {
        throw new BadRequestException(`${source.itemName}: chỉ còn trả được ${source.maxReturnable}`);
      }
      if (!source.locationId) throw new BadRequestException(`${source.itemName}: dòng gốc không có kho để nhận hàng trả`);
      return {
        originalInvoiceItemId: source.originalInvoiceItemId,
        itemId: source.itemId,
        itemCode: source.itemCode,
        itemName: source.itemName,
        unit: source.unit,
        locationId: source.locationId,
        quantity: line.quantity,
        unitPrice: source.refundableUnitPrice,
      };
    });
    const reason = dto.reason?.trim() || 'Đổi trả tại quầy';

    let refundAccountId: string | undefined;
    if (dto.refundMethod === MobileRefundMethod.BANK) {
      if (!dto.paymentAccountId) throw new BadRequestException('Chuyển khoản phải chọn tài khoản');
      const account = await this.paymentAccountRepo.findOne({
        where: { id: dto.paymentAccountId, organizationId: actor.organizationId },
      });
      if (!account?.depositAccountId) throw new BadRequestException('Tài khoản chưa gắn tài khoản ngân hàng (deposit account)');
      refundAccountId = account.depositAccountId;
    }

    const newLines = dto.newLines ?? [];
    const created =
      newLines.length === 0
        ? await this.createReturn.create(
            { mode: ReturnInvoiceMode.REGULAR, originalInvoiceId: dto.originalInvoiceId, sessionId: session.id, reason, lines: returnLines },
            actor,
          )
        : await this.createExchange.create(
            {
              sessionId: session.id,
              originalInvoiceId: dto.originalInvoiceId,
              reason,
              returnLines,
              newLines: newLines.map((l) => ({
                itemId: l.itemId,
                itemCode: l.itemCode,
                itemName: l.itemName,
                unit: l.unit,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                lineDiscount: l.lineDiscount,
                note: l.note,
              })),
            },
            actor,
          );

    const issued = await this.checkoutReturn.checkout(
      created.id,
      {
        refundMethod: dto.refundMethod === MobileRefundMethod.BANK ? RefundMethod.BANK : RefundMethod.CASH,
        refundAccountId,
        cashAccountId: session.cashAccountId ?? undefined,
        payments: dto.payments?.map((p) => ({ paymentMethod: p.method, amount: p.amount, paymentAccountId: p.paymentAccountId })),
      },
      actor,
    );

    const net = Number(issued.netAmount);
    return {
      id: issued.id,
      code: issued.code,
      status: issued.status,
      // Âm = khách nhận lại tiền; dương = khách trả thêm (mua thêm nhiều hơn trả).
      netAmount: net,
      refundAmount: Number(issued.refundedAmount),
      extraAmount: net > 0 ? net : 0,
      debtOffset: Number(issued.offsetAmount),
      totalPaid: Number(issued.totalPaid),
    };
  }
  /**
   * Báo cáo hoạt động trong CA (T-21-01, AC-77): tổng hợp ngày của POS bó vào
   * cửa sổ của phiên đang mở (`openedAt..now`, `cashierId` = người mở ca, chi
   * nhánh của phiên) — ca qua đêm vẫn đúng vì cửa sổ là mốc giờ, không phải
   * ngày. Sáu nhóm theo MISA; nhóm ERP chưa có nghiệp vụ (giao hàng, đặt cọc) = 0.
   * Chưa mở ca → `session: null`, không có số.
   */
  async shiftReport(actor: ActorContext) {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    const session = await this.sessions.findOne({
      where: { organizationId: actor.organizationId, branchId: actor.branchId, status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES, SessionStatus.CLOSING]) },
      order: { openedAt: 'DESC' },
    });
    if (!session) return { session: null, totals: null, groups: [] };

    const now = new Date();
    const dto = new PosDailySummaryDto();
    dto.issuedAt = { from: session.openedAt.toISOString(), to: (session.closedAt ?? now).toISOString() };
    dto.branchId = session.branchId;
    dto.cashierId = session.openedBy;
    const summary: PosDailySummaryResult = await this.queryBus.execute(new GetPosDailySummaryQuery(dto, actor));

    const r = summary.revenue;
    const returned = Number(summary.goodsReturned?.value ?? 0);
    const debtCollected = Number(summary.debt.debtCollected);
    const newDebt = Number(summary.debt.newDebt);
    // Doanh thu của POS đã trừ hàng trả (dòng âm); tách lại để bày như MISA: bán tại cửa hàng dương, đổi trả âm.
    const storeCash = Number(r.cash) + returned;
    const groups = [
      { key: 'store', total: storeCash + Number(r.card) + Number(r.bankTransfer) + newDebt, lines: [{ key: 'cash', amount: storeCash }, { key: 'card', amount: Number(r.card) }, { key: 'bankTransfer', amount: Number(r.bankTransfer) }, { key: 'debt', amount: newDebt }] },
      { key: 'delivery', total: 0, lines: [{ key: 'cash', amount: 0 }, { key: 'cod', amount: 0 }, { key: 'debt', amount: 0 }] },
      { key: 'returns', total: -returned, lines: [{ key: 'cash', amount: -returned }, { key: 'card', amount: 0 }, { key: 'bankTransfer', amount: 0 }, { key: 'debt', amount: 0 }] },
      { key: 'debtCollection', total: debtCollected, lines: [{ key: 'cash', amount: debtCollected }] },
      { key: 'deposit', total: 0, lines: [] },
      { key: 'depositRefund', total: 0, lines: [] },
    ];

    return {
      session: { id: session.id, status: session.status, openedAt: session.openedAt, closedAt: session.closedAt ?? null, openedBy: session.openedBy },
      generatedAt: now,
      totals: { cash: Number(r.cash) + debtCollected, card: Number(r.card) + Number(r.bankTransfer), total: Number(r.total) + debtCollected },
      groups,
    };
  }
}

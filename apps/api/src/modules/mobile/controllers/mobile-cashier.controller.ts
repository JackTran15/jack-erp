import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileCloseShiftDto, MobileOpenShiftDto } from '../dto/mobile-session.dto';
import { MobileCreateDraftDto, MobileRedeemPointsDto, MobileUpdateDraftDto } from '../dto/mobile-cashier-draft.dto';
import { MobileCheckoutDto, MobileCheckoutPreviewDto } from '../dto/mobile-checkout.dto';
import { MobileCollectDebtDto, MobileDebtorsQueryDto } from '../dto/mobile-debt.dto';
import { MobileExchangeDto, MobileReturnableQueryDto } from '../dto/mobile-exchange.dto';
import { PointsRedemptionService } from '../../pos/services/points-redemption.service';
import { MobileCashierService } from '../services/mobile-cashier.service';

/**
 * Thu ngân trên erp_sales — phiên POS, thu tiền, thu nợ, đổi trả, báo cáo ca.
 *
 * **Mốc vai là `accounting.cash.create`** — đúng key mà app dùng để phân biệt
 * Thu ngân với Nhân viên bán hàng (A-56). `pos.invoice.write` KHÔNG dùng được
 * làm mốc: seed cấp nó cho cả hai vai, nên một tư vấn gọi thẳng đường này sẽ
 * qua guard. Mỗi đường mang THÊM quyền nghiệp vụ riêng khi cần.
 *
 * `@RequireBranchScope()` là bắt buộc — thiếu nó `@Actor()` âm thầm rơi về
 * `branchIds[0]` (xem `sales-order.controller`). KHÔNG `@Version()` — module
 * mobile chạy `VERSION_NEUTRAL`.
 */
@ApiTags('mobile')
@Controller('mobile/cashier')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
@RequirePermission('accounting.cash.create')
export class MobileCashierController {
  constructor(
    private readonly service: MobileCashierService,
    private readonly points: PointsRedemptionService,
  ) {}

  @Get('session')
  @ApiOperation({ summary: 'Phiên POS đang mở của chi nhánh (ưu tiên phiên do người gọi mở)' })
  @ApiOkResponse({ description: '{ open, session | null }' })
  session(@Actor() actor: ActorContext) {
    return this.service.session(actor);
  }

  @Get('cash-accounts')
  @RequirePermission('accounting.cash.read')
  @ApiOperation({ summary: 'Két quầy (REGISTER) của chi nhánh — ô Két tiền của màn Mở ca' })
  cashAccounts(@Actor() actor: ActorContext) {
    return this.service.cashAccounts(actor);
  }

  @Post('session/open')
  @RequirePermission('pos.session.manage')
  @ApiOperation({ summary: 'Mở ca (open + start-sales)' })
  openShift(@Body() dto: MobileOpenShiftDto, @Actor() actor: ActorContext) {
    return this.service.openShift(dto, actor);
  }

  @Post('session/start-close')
  @RequirePermission('pos.session.manage')
  @ApiOperation({ summary: 'Mở màn Đóng ca: phiên sang CLOSING, trả Tiền thu trong ca' })
  startClose(@Actor() actor: ActorContext) {
    return this.service.startClose(actor);
  }

  @Post('session/reopen')
  @RequirePermission('pos.session.manage')
  @ApiOperation({ summary: 'HỦY BỎ màn Đóng ca: CLOSING → ACTIVE_SALES (A-68)' })
  reopen(@Actor() actor: ActorContext) {
    return this.service.reopen(actor);
  }

  @Post('session/close')
  @RequirePermission('pos.session.manage')
  @ApiOperation({ summary: 'ĐỒNG Ý màn Đóng ca: kiểm kê + đóng; lệch → 409 VARIANCE_NEEDS_APPROVAL' })
  closeShift(@Body() dto: MobileCloseShiftDto, @Actor() actor: ActorContext) {
    return this.service.closeShift(dto, actor);
  }

  /** Hoá đơn nháp dưới hình dạng giỏ (T-15-01). Quyền lớp: `accounting.cash.create`. */
  @Get('drafts/:invoiceId')
  draft(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Actor() actor: ActorContext) {
    return this.service.draft(invoiceId, actor);
  }

  /** Giỏ thu ngân tự dựng → hoá đơn nháp (cần ca đang mở). */
  @Post('drafts')
  createDraft(@Body() dto: MobileCreateDraftDto, @Actor() actor: ActorContext) {
    return this.service.createDraft(dto, actor);
  }

  @Patch('drafts/:invoiceId')
  updateDraft(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MobileUpdateDraftDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateDraft(invoiceId, dto, actor);
  }

  /**
   * Đổi điểm tích luỹ vào hoá đơn NHÁP (màn *Sử dụng điểm*).
   *
   * Uỷ quyền `PointsRedemptionService` — **cùng service** mà POS web gọi ở
   * `POST /invoices/:id/redeem-points`. Hai đường, một luật: số dư, trần theo
   * tiền hàng, và việc trừ điểm thật lúc checkout đều nằm ở đó.
   *
   * `pos.invoice.write` **THAY THẾ** khoá cấp class, không cộng thêm vào nó:
   * `PermissionGuard` đọc bằng `getAllAndOverride([handler, class])`, nên khoá
   * ở method ghi đè khoá ở class, và mảng khoá là HOẶC chứ không phải VÀ.
   *
   * Câu trước ở đây nói ngược lại — rằng `accounting.cash.create` cấp class
   * "vẫn là thứ chặn một tư vấn gọi thẳng vào đây". **SAI**, và đo được
   * 2026-09-16 bằng một tài khoản *Nhân viên bán hàng* thật: vai đó KHÔNG có
   * `accounting.cash.create` (nên `GET /mobile/cashier/session` trả 403) mà
   * vẫn đi qua được guard của đường này — 404 vì id không tồn tại, tức đã qua
   * cửa. Cả *Nhân viên bán hàng* lẫn *Nhân viên thu ngân* đều cầm
   * `pos.invoice.write` trong seed.
   *
   * Hệ quả: một tư vấn cầm id một hoá đơn nháp thì đổi điểm được trên đó. Đã
   * cân nhắc thu hẹp sang `accounting.cash.create` và **quyết định KHÔNG** —
   * theo POS, đo 2026-09-16:
   *
   *  - `POST /invoices/:id/redeem-points` của pos-web gác đúng
   *    `pos.invoice.write`, và `InvoiceController` bên đó KHÔNG có khoá cấp
   *    class nào cả. Cùng một hành động, cùng một khoá, hai mặt tiền.
   *  - Toàn bộ pos-web kiểm quyền ở ĐÚNG HAI file — `invoice-cancel.constant.ts`
   *    và dialog dùng nó. Huỷ hoá đơn là hành động duy nhất bên đó coi là phải
   *    gác; đổi điểm thì không.
   *
   * Thu hẹp một mình tầng mobile là để hai mặt tiền gác cùng một việc bằng hai
   * khoá khác nhau — đúng thứ `points-redemption.service` được dựng ra để tránh
   * (một luật đổi điểm cho cả ba mặt tiền). Muốn chặt hơn thì chặt ở CẢ HAI,
   * và đó là một quyết định về nghiệp vụ chứ không phải một lượt dọn tầng mobile.
   */
  @Post('drafts/:invoiceId/points')
  @RequirePermission('pos.invoice.write')
  @ApiOperation({ summary: 'Đổi điểm tích luỹ vào hoá đơn nháp' })
  redeemPoints(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MobileRedeemPointsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.points.applyRedemption(invoiceId, dto.points, actor);
  }

  /** Gỡ điểm khỏi hoá đơn nháp — app gọi khi người dùng nhập `0`. */
  @Delete('drafts/:invoiceId/points')
  @RequirePermission('pos.invoice.write')
  @ApiOperation({ summary: 'Gỡ đổi điểm khỏi hoá đơn nháp' })
  removeRedeemedPoints(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.points.removeRedemption(invoiceId, actor);
  }

  /** Tài khoản nhận chuyển khoản/thẻ cho màn Thu tiền (T-16-01). */
  @Get('payment-accounts')
  @RequirePermission('accounting.cash.read')
  paymentAccounts(@Actor() actor: ActorContext) {
    return this.service.paymentAccounts(actor);
  }

  /**
   * Thu tiền hoá đơn nháp qua checkout saga v2 (T-03-02) — phát hành số hoá
   * đơn, ghi sổ quỹ / công nợ / kho / điểm, cùng đường với POS web.
   *
   * `x-idempotency-key` đọc như `collectDebt`, nhưng vắng thì rơi về
   * `invoiceId` (không phải `randomUUID()`): khoá của saga phải ổn định qua
   * các lần gửi lại, nếu không một lượt thu mất phản hồi sẽ thu hai lần.
   *
   * Trả: `{ invoiceId, invoiceCode, status, amountDue, totalPaid, remainder, salesOrderId }`
   * — giữ nguyên hình dạng thời v1 mà app đang đọc.
   */
  @Post('drafts/:invoiceId/checkout')
  checkout(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MobileCheckoutDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.service.checkout(invoiceId, dto, idempotencyKey, actor);
  }

  /**
   * Số phải thu theo saga, trước khi thu (ADR-51). Không ghi gì, không mở
   * transaction; hoá đơn không còn là nháp → 400 `INVOICE_NOT_CHECKOUTABLE`.
   * Quyền: khoá lớp `accounting.cash.create` — cố ý không thêm khoá method,
   * vì khoá method THAY THẾ khoá lớp (xem `redeemPoints`).
   *
   * Trả (tổng phẳng ở cấp gốc):
   * ```
   * { subtotal, manualDiscountAmount, promotionDiscount, pointsRedeemed,
   *   pointsDiscountAmount, depositAmount, amountDue, pointsEarned,
   *   appliedPrograms: [{ programId, code, name, type, discountAmount,
   *                       lineDiscounts: [{ lineId, discountAmount }] }] }
   * ```
   * `pointsRedeemed` là số SAU khi saga kẹp; `pointsEarned` đã qua luật khách
   * lẻ / CTKM chặn tích điểm — đúng số hoá đơn sẽ lưu.
   */
  @Post('drafts/:invoiceId/checkout/preview')
  @ApiOperation({ summary: 'Xem trước số phải thu của hoá đơn nháp theo checkout saga' })
  previewCheckout(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MobileCheckoutPreviewDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.previewCheckout(invoiceId, dto, actor);
  }

  /** Khách còn nợ (T-17-01). */
  @Get('debtors')
  @RequirePermission('accounting.cash_receipt.read')
  debtors(@Query() query: MobileDebtorsQueryDto, @Actor() actor: ActorContext) {
    return this.service.debtors(query, actor);
  }

  @Get('debtors/:customerId/debts')
  @RequirePermission('accounting.cash_receipt.read')
  debtsOf(@Param('customerId', ParseUUIDPipe) customerId: string, @Actor() actor: ActorContext) {
    return this.service.debtsOf(customerId, actor);
  }

  /** Thu nợ nhiều hoá đơn — tiền mặt (phiếu thu) hoặc chuyển khoản (phiếu thu ngân hàng). */
  @Post('debts/collect')
  @RequirePermission('accounting.cash_receipt.create')
  collectDebt(
    @Body() dto: MobileCollectDebtDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.service.collectDebt(dto, idempotencyKey || randomUUID(), actor);
  }

  /** Đổi trả (T-18-01): hoá đơn đủ điều kiện, chi tiết chọn hàng trả, lập phiếu đổi/trả. */
  @Get('returnable-invoices')
  @RequirePermission('pos.return.create')
  returnableInvoices(@Query() query: MobileReturnableQueryDto, @Actor() actor: ActorContext) {
    return this.service.returnableInvoices(query, actor);
  }

  @Get('returnable-invoices/:invoiceId')
  @RequirePermission('pos.return.create')
  returnableDetail(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Actor() actor: ActorContext) {
    return this.service.returnableDetail(invoiceId, actor);
  }

  @Post('exchanges')
  @RequirePermission('pos.return.create')
  exchange(@Body() dto: MobileExchangeDto, @Actor() actor: ActorContext) {
    return this.service.exchange(dto, actor);
  }

  /** Báo cáo hoạt động trong ca đang mở (T-21-01). */
  @Get('shift-report')
  @RequirePermission('accounting.cash.read')
  shiftReport(@Actor() actor: ActorContext) {
    return this.service.shiftReport(actor);
  }
}

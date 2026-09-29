import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';
import { DeliveryStatus, SalesOrderStatus } from '../entities/sales-order.entity';

/** Which POS screen is asking: "Đơn hàng Online" or "Đơn hàng" (delivery grid). */
export enum BranchSalesOrderView {
  ONLINE = 'ONLINE',
  DELIVERY = 'DELIVERY',
}

/** Which timestamp the top-level `from`/`to` window applies to (A-16). */
export enum BranchSalesOrderDateField {
  CREATED = 'CREATED',
  DELIVERED = 'DELIVERED',
  INVOICED = 'INVOICED',
}

/**
 * Tab of the DELIVERY grid. A delivery status narrows to that status (live
 * orders only — except `RETURNED`, which is itself a cancellation, ADR-04);
 * `CANCELLED` is `status = CANCELLED`; `PAID` / `UNPAID` are derived from the
 * invoice (A-06), so an order can sit in a delivery tab and a payment tab at
 * once. Absent = "Tất cả".
 */
export enum BranchDeliveryTab {
  AWAITING_PICKUP = DeliveryStatus.AWAITING_PICKUP,
  IN_TRANSIT = DeliveryStatus.IN_TRANSIT,
  AWAITING_COD = DeliveryStatus.AWAITING_COD,
  COMPLETED = DeliveryStatus.COMPLETED,
  FAILED = DeliveryStatus.FAILED,
  RETURNED = DeliveryStatus.RETURNED,
  CANCELLED = 'CANCELLED',
  PAID = 'PAID',
  UNPAID = 'UNPAID',
}

/**
 * Per-column filter row of the POS grid — same operator shapes the POS invoice
 * grid sends to `/v2/invoices/search`.
 */
export class BranchSalesOrderColumnFiltersDto {
  /** Mã đơn hàng (OCM) → `external_order_id`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  externalOrderId?: StringFilterDto;

  /** Ngày đơn hàng → `created_at`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  orderDate?: DateRangeFilterDto;

  /**
   * Thông tin giao hàng — the grid shows a composed string, so the filter is
   * matched against each source column (recipient name/phone, address line,
   * ward, province) with OR.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  deliveryInfo?: StringFilterDto;

  /** Tổng thanh toán → `amount_due`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amountDue?: CompareFilterDto;

  /** Trạng thái → `status`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** ĐT giao vận → `delivery_partner_name` (snapshot). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  deliveryPartnerName?: StringFilterDto;

  /** NV bán hàng → `salesperson_name` (snapshot). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  salespersonName?: StringFilterDto;

  /** Số hoá đơn → `invoices.code`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  invoiceCode?: StringFilterDto;

  /** Ghi chú → `note`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  note?: StringFilterDto;

  // ── DELIVERY view only (ignored by ONLINE) ────────────────────────────────

  /** Ngày GH → `delivered_at`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  deliveredAt?: DateRangeFilterDto;

  /** Ngày HĐ → `invoices.issued_at`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  invoiceDate?: DateRangeFilterDto;

  /** Khách hàng → `customer_name` (snapshot). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerName?: StringFilterDto;

  /** Mã vận đơn → `tracking_code`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  trackingCode?: StringFilterDto;

  /** Thông tin gói hàng → `package_info`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  packageInfo?: StringFilterDto;

  /** Kênh bán hàng → `sales_channel` (snapshot label). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  salesChannel?: StringFilterDto;

  /** Trạng thái giao → `delivery_status`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  deliveryStatus?: EnumFilterDto;

  /** Phí GH thu khách → `invoices.shipping_fee_amount`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  shippingFeeCustomer?: CompareFilterDto;

  /** Đặt cọc → `invoices.deposit_amount`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  deposit?: CompareFilterDto;

  /** Khách nợ / Còn phải thu → `invoice_debts.remaining_amount`, 0 without a debt. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  remainingReceivable?: CompareFilterDto;

  /** Phí GH trả ĐT → `partner_shipping_fee`; NULL (unknown) never matches. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  partnerShippingFee?: CompareFilterDto;
}

/**
 * Body of `POST /v2/mobile/sales-orders/search` (ADR-03).
 *
 * There is deliberately no `branchId`: the branch is the caller's active
 * branch (`X-Branch-Id`, validated by `BranchScopeGuard`). The global
 * `forbidNonWhitelisted` pipe rejects a body that tries to send one.
 */
export class SearchBranchSalesOrdersDto {
  @ApiProperty({ enum: BranchSalesOrderView })
  @IsEnum(BranchSalesOrderView)
  view: BranchSalesOrderView;

  /** `sales_channels.id` — required for the ONLINE view (the sidebar selection), optional for DELIVERY. */
  @ApiPropertyOptional()
  @ValidateIf((o: SearchBranchSalesOrdersDto) => o.view === BranchSalesOrderView.ONLINE)
  @IsUUID()
  channelId?: string;

  /** Status tab (A-13). Absent = "Tất cả". DRAFT never matches. */
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  /** DELIVERY view tab. Absent = "Tất cả" (every order in the delivery lifecycle). */
  @ApiPropertyOptional({ enum: BranchDeliveryTab })
  @IsOptional()
  @IsEnum(BranchDeliveryTab)
  deliveryTab?: BranchDeliveryTab;

  @ApiPropertyOptional({ enum: BranchSalesOrderDateField, default: BranchSalesOrderDateField.CREATED })
  @IsOptional()
  @IsEnum(BranchSalesOrderDateField)
  dateField?: BranchSalesOrderDateField;

  /** `YYYY-MM-DD` = a business-local (Asia/Ho_Chi_Minh) day; a full timestamp is an exact instant. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Nhãn "Thiếu hàng" (A-10). Absent = no label filter. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stockShort?: boolean;

  @ApiPropertyOptional({ type: BranchSalesOrderColumnFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSalesOrderColumnFiltersDto)
  columnFilters?: BranchSalesOrderColumnFiltersDto;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** One grid row: the 10 ONLINE columns (A-11/A-12) + `id`, `status`, `stockShort`. */
export interface BranchSalesOrderRow {
  id: string;
  status: SalesOrderStatus;
  stockShort: boolean;
  /** Mã đơn hàng (OCM). */
  externalOrderId: string | null;
  /** Ngày đơn hàng. */
  createdAt: Date;
  /** Thông tin giao hàng — composed by the client. */
  recipientName: string | null;
  recipientPhone: string | null;
  shipAddressLine: string | null;
  shipWardName: string | null;
  shipProvinceName: string | null;
  /** Tổng thanh toán. */
  amountDue: number;
  /** ĐT giao vận. */
  deliveryPartnerName: string | null;
  /** NV bán hàng. */
  salespersonName: string | null;
  invoiceId: string | null;
  /** Số hoá đơn. */
  invoiceCode: string | null;
  /** Ghi chú. */
  note: string | null;
}

/**
 * One DELIVERY grid row: the ONLINE row + the delivery-grid columns (A-11/A-12)
 * and what the client needs to act on the row.
 */
export interface BranchDeliveryOrderRow extends BranchSalesOrderRow {
  deliveryStatus: DeliveryStatus;
  /** `DELIVERY_TRANSITIONS[deliveryStatus]`; empty once the order is cancelled. */
  allowedNextStatuses: DeliveryStatus[];
  /** Ngày GH — first move to IN_TRANSIT. */
  deliveredAt: Date | null;
  /** Ngày HĐ — `invoices.issued_at`. */
  invoiceDate: Date | null;
  /** NULL when the order has no invoice. */
  invoiceIsDraft: boolean | null;
  /** Thu ngân — the user who approved the order (`approved_by`). */
  cashierName: string | null;
  /** Khách hàng. */
  customerName: string | null;
  /** Kênh bán hàng — label snapshot on the order. */
  salesChannel: string;
  /** Loại đơn hàng — every `sales_orders` row is an order ("Đặt hàng"). */
  orderType: 'ORDER';
  /** Mã vận đơn. */
  trackingCode: string | null;
  /** Thông tin gói hàng. */
  packageInfo: string | null;
  /** Phí GH thu khách — `invoices.shipping_fee_amount`. */
  shippingFeeCustomer: number;
  /** Đặt cọc — `invoices.deposit_amount`. */
  deposit: number;
  /** Khách nợ — `invoice_debts.remaining_amount`, 0 without a debt. */
  customerDebt: number;
  /** Còn phải thu — same source as {@link customerDebt} (A-12). */
  remainingReceivable: number;
  /** Thu hộ — constant 0 this round (A-12, Thu COD out of scope). */
  cod: number;
  /** Phí GH trả ĐT — NULL = unknown, distinct from 0. */
  partnerShippingFee: number | null;
  debtId: string | null;
}

export interface SearchBranchSalesOrdersResult {
  data: Array<BranchSalesOrderRow | BranchDeliveryOrderRow>;
  total: number;
  page: number;
  limit: number;
}

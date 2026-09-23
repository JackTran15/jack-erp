import { ApiProperty } from '@nestjs/swagger';

/** Tiền thu tách theo ba phương thức thật của hệ (`InvoicePaymentMethod`). Đồng. */
export class MobilePaymentSplitDto {
  @ApiProperty({ description: '`cash`' })
  cash!: number;

  @ApiProperty({ description: '`card`' })
  card!: number;

  @ApiProperty({ description: '`bank_transfer`' })
  transfer!: number;
}

/** Doanh thu trong kỳ, tách theo trạng thái thanh toán của hoá đơn. */
export class MobileStoreRevenueDto {
  @ApiProperty({ description: 'Tổng doanh thu — cùng công thức và cùng số với dòng chi nhánh ở /mobile/reports/overview' })
  total!: number;

  @ApiProperty({ description: 'Doanh thu của hoá đơn `paid`' })
  paidAmount!: number;

  @ApiProperty({ description: 'Số hoá đơn `paid`' })
  paidCount!: number;

  @ApiProperty({ description: 'Doanh thu của hoá đơn `debt` + `partial_debt` (chưa thanh toán đủ)' })
  unpaidAmount!: number;

  @ApiProperty({ description: 'Số hoá đơn `debt` + `partial_debt`' })
  unpaidCount!: number;

  @ApiProperty({ description: 'Số hoá đơn HUỶ trong kỳ — không nằm trong `total`' })
  cancelledCount!: number;

  @ApiProperty({ description: 'Số hoá đơn đã ghi sổ trừ huỷ — bằng `invoiceCount` ở Tổng quan' })
  invoiceCount!: number;
}

/** Tiền thu trong kỳ theo NGUỒN thu; mỗi nguồn tách theo phương thức. */
export class MobileStoreCollectedDto {
  @ApiProperty({ type: MobilePaymentSplitDto, description: 'Thanh toán trên hoá đơn (`invoice_payments`), trả hàng mang dấu âm' })
  sales!: MobilePaymentSplitDto;

  @ApiProperty({ type: MobilePaymentSplitDto, description: 'Thu nợ sau bán (`debt_payments`, theo `paid_at`)' })
  debt!: MobilePaymentSplitDto;
}

/** Một khách tạo tại cửa hàng trong kỳ. */
export class MobileStoreNewCustomerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'ISO-8601' })
  createdAt!: Date;

  @ApiProperty({ description: 'Doanh thu của khách tại cửa hàng TRONG KỲ, cùng công thức `total`' })
  amount!: number;
}

export class MobileStoreNewCustomersDto {
  @ApiProperty({ description: 'Tổng số khách tạo trong kỳ — của TOÀN tập, không chỉ `items`' })
  count!: number;

  @ApiProperty({ description: 'Tổng doanh thu của toàn tập khách mới' })
  totalAmount!: number;

  @ApiProperty({ type: [MobileStoreNewCustomerDto], description: 'Tối đa 20 khách mới nhất' })
  items!: MobileStoreNewCustomerDto[];
}

export class MobileStoreInventoryDto {
  @ApiProperty({ description: 'Tổng SỐ LƯỢNG tồn hiện tại (mọi kho của cửa hàng), như /mobile/inventory/stores/:id' })
  quantity!: number;

  @ApiProperty({ description: 'Giá trị tồn theo giá vốn' })
  stockValue!: number;
}

/**
 * `GET /mobile/reports/overview/branches/:id` — màn chi tiết MỘT cửa hàng.
 *
 * Chỉ trả những trục backend CÓ nghiệp vụ. Bản thiết kế còn có giao hàng,
 * COD, thu hộ, voucher, đặt cọc, thu khác — hệ này không có bảng nào cho
 * chúng; app tự điền 0 theo bố cục (chốt với người dùng), server không bịa
 * khoá để rồi phải nói "luôn là 0".
 */
export class MobileStoreDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: MobileStoreRevenueDto })
  revenue!: MobileStoreRevenueDto;

  @ApiProperty({ type: MobileStoreCollectedDto })
  collected!: MobileStoreCollectedDto;

  @ApiProperty({ description: 'Hoá đơn còn nợ của cửa hàng — KHÔNG theo kỳ, là trạng thái hiện tại' })
  pendingUnpaidCount!: number;

  @ApiProperty({
    description:
      'Đơn hàng tư vấn gửi lên đang CHỜ XỬ LÝ (`sales_orders.status = SENT`) — cũng không theo kỳ, cùng lý do `pendingUnpaidCount`',
  })
  pendingOrderCount!: number;

  @ApiProperty({ type: MobileStoreNewCustomersDto })
  newCustomers!: MobileStoreNewCustomersDto;

  @ApiProperty({ type: MobileStoreInventoryDto })
  inventory!: MobileStoreInventoryDto;
}

import { ApiProperty } from '@nestjs/swagger';

/**
 * Một hoá đơn theo hình dạng app mobile đọc được — dòng của danh sách hoá đơn
 * và của lịch sử mua hàng. Khớp phần "đầu" của `InvoiceEntity` phía Dart.
 *
 * - `status` chỉ còn BA giá trị (bảng ánh xạ ở `MobileInvoiceService`).
 * - `type` viết thường; `return` giữ nguyên chữ dù Dart phải đặt enum là
 *   `returned` — hợp đồng dây theo backend, Dart tự nắn.
 * - `amount` là TỔNG CÓ DẤU: `amount_due` với hoá đơn bán, `net_amount` với
 *   trả/đổi hàng — cùng cột "Tổng thanh toán" mà web hiện.
 * - `createdAt` luôn có; `issuedAt` chỉ có khi đã ghi sổ (mọi dòng trả về
 *   đều đã ghi sổ, nhưng cột vẫn nullable nên giữ `| null`).
 */
export class MobileInvoiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Số hoá đơn' })
  code!: string;

  @ApiProperty({ enum: ['sale', 'return', 'exchange'] })
  type!: 'sale' | 'return' | 'exchange';

  @ApiProperty({ enum: ['paid', 'unpaid', 'cancelled'] })
  status!: 'paid' | 'unpaid' | 'cancelled';

  @ApiProperty({ description: 'ISO-8601' })
  createdAt!: string;

  @ApiProperty({ nullable: true, type: String, description: 'ISO-8601' })
  issuedAt!: string | null;

  @ApiProperty({ description: 'Tổng thanh toán có dấu, đơn vị đồng' })
  amount!: number;

  @ApiProperty({ nullable: true, type: String })
  customerName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  customerPhone!: string | null;
}

/** Một dòng hàng của hoá đơn — khớp `InvoiceLineEntity` phía Dart. */
export class MobileInvoiceLineDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Mã hàng (SKU) tại thời điểm bán' })
  sku!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty({ description: 'Thành tiền sau chiết khấu dòng' })
  total!: number;
}

/** Điểm tích luỹ quanh hoá đơn — khớp `InvoiceLoyaltyEntity` phía Dart. */
export class MobileInvoiceLoyaltyDto {
  @ApiProperty({ description: 'Điểm trước hoá đơn' })
  opening!: number;

  @ApiProperty()
  earned!: number;

  @ApiProperty()
  used!: number;
}

/**
 * Chi tiết một hoá đơn = dòng danh sách + phần thân. Một DTO cho cả hai màn
 * gọi tới (`/mobile/invoices/:id` từ tab Hoá đơn và từ lịch sử mua) — chúng
 * cùng mở một màn chi tiết.
 *
 * `salesChannel` cố ý KHÔNG có: backend không mô hình hoá kênh bán; app hiện
 * dấu gạch cho ô đó.
 */
export class MobileInvoiceDetailResponseDto extends MobileInvoiceResponseDto {
  @ApiProperty({ nullable: true, type: String, description: 'Nhân viên bán' })
  salesperson!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Thu ngân (người lập)' })
  cashier!: string | null;

  @ApiProperty({ description: 'Tổng tiền hàng trước chiết khấu' })
  subtotal!: number;

  @ApiProperty({ description: 'Chiết khấu hoá đơn + chiết khấu điểm' })
  discount!: number;

  @ApiProperty({ description: 'Tổng tiền khách đưa qua mọi phương thức' })
  cashReceived!: number;

  @ApiProperty({ description: 'Tiền thừa trả lại' })
  changeAmount!: number;

  @ApiProperty({ type: [String], description: 'Mã loại chương trình khuyến mãi đã áp' })
  promotions!: string[];

  @ApiProperty({ nullable: true, type: MobileInvoiceLoyaltyDto })
  loyalty!: MobileInvoiceLoyaltyDto | null;

  @ApiProperty({ type: [MobileInvoiceLineDto] })
  lines!: MobileInvoiceLineDto[];
}

/**
 * Một trang hoá đơn. `totalAmount` là tổng có dấu của TOÀN tập khớp, LOẠI hoá
 * đơn đã huỷ — thanh "Tổng" của app nói về tiền còn hiệu lực. Dòng huỷ vẫn
 * mang số tiền gốc để người xem biết đơn đó từng bao nhiêu.
 */
export class MobileInvoicePageDto {
  @ApiProperty({ type: [MobileInvoiceResponseDto] })
  data!: MobileInvoiceResponseDto[];

  @ApiProperty({ description: 'Tổng số bản ghi khớp, không phải số bản ghi của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Tổng tiền toàn tập khớp, không tính hoá đơn huỷ' })
  totalAmount!: number;
}

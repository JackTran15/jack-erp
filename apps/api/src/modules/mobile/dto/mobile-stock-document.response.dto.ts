import { ApiProperty } from '@nestjs/swagger';

/** Trạng thái phiếu theo cách app hiển thị — ba nhãn, không phải bốn. */
export type MobileStockDocumentStatus = 'draft' | 'posted' | 'cancelled';

/**
 * Một dòng chứng từ kho theo hình dạng app mobile đọc được.
 *
 * BẢY trường, khớp đúng những gì hàng danh sách vẽ: mã phiếu, ngày, đối tượng,
 * số tiền, nhãn trạng thái — cộng `id` làm khoá điều hướng.
 *
 * Cố ý KHÔNG trả:
 *
 * - `lines` — app không hiện chi tiết hàng ở màn danh sách, mà chính chúng là
 *   phần nặng nhất: response của web ~7.6 KB/phiếu vì kéo theo cả `item` của
 *   từng dòng. Số tiền đã được server cộng sẵn vào [amount].
 * - `provider` đầy đủ — object đó mang `maxDebt`, số tài khoản ngân hàng và
 *   CMND của nhà cung cấp. Cùng lập luận đã khiến `MobileSupplierResponseDto`
 *   bỏ `maxDebt`: app không hiển thị, nên nó thuần tuý là bề mặt rò rỉ. Chỉ
 *   `partyName`/`partyCode` đi ra.
 * - `location`, `journalEntryId`, `cashAccountId`, `cashPaymentId`,
 *   `purchasingEmployeeId`, `paymentMethod`, `revision` — app không hiển thị.
 *
 * Thêm lại bất kỳ trường nào ở trên là thay đổi CỘNG THÊM, không phá client cũ
 * — nên thêm khi màn hình cần, đừng dựng sẵn.
 */
export class MobileStockDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Số phiếu. NULL khi phiếu chưa ghi sổ — backend chỉ sinh mã lúc post, ' +
      'nên app phải có đường hiển thị thay thế chứ đừng ép kiểu.',
  })
  code!: string | null;

  @ApiProperty({
    description: 'Ngày nhận hàng (`receivedAt`), ISO-8601. Đây là ngày người dùng đọc, không phải `createdAt`.',
  })
  documentDate!: string;

  @ApiProperty({
    nullable: true,
    description: 'Tên đối tượng: nhà cung cấp, khách hàng hoặc nhân viên tuỳ loại phiếu',
  })
  partyName!: string | null;

  @ApiProperty({ nullable: true, description: 'Mã nhà cung cấp; null với đối tượng không phải NCC' })
  partyCode!: string | null;

  @ApiProperty({
    description: 'Thành tiền của phiếu — server cộng từ các dòng hàng, app không phải tự tính',
  })
  amount!: number;

  @ApiProperty({
    enum: ['draft', 'posted', 'cancelled'],
    description:
      'Backend có BỐN trạng thái nhưng `REVERSED` (đảo bút toán) và `CANCELLED` đều ' +
      'hiển thị là "Đã hủy", nên chúng gộp làm một ở đây — đúng như trang web đang làm.',
  })
  status!: MobileStockDocumentStatus;
}

/**
 * Một trang chứng từ. `limit` chứ không `pageSize` — gương theo `/mobile/suppliers`
 * và `/mobile/products`.
 */
export class MobileStockDocumentPageDto {
  @ApiProperty({ type: [MobileStockDocumentResponseDto] })
  data!: MobileStockDocumentResponseDto[];

  @ApiProperty({ description: 'Tổng số phiếu khớp bộ lọc, không phải số phiếu của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({
    description:
      'Số liệu của TOÀN BỘ kết quả lọc, không phải của trang hiện tại — thanh "Tổng" ' +
      'đầu danh sách đọc nó. Cộng ở client thì con số sẽ nhảy mỗi lần cuộn thêm trang.',
  })
  summary!: { totalAmount: number };
}

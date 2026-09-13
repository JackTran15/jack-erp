import { ApiProperty } from '@nestjs/swagger';

/**
 * Một khách hàng theo hình dạng app mobile đọc được — dùng chung cho danh sách
 * lẫn chi tiết, vì màn chi tiết của app không cần thêm trường nào ngoài những
 * gì hàng của danh sách đã mang.
 *
 * Khác `CustomerEntity` của web ở ba chỗ, đều có lý do:
 *
 * - `status` viết THƯỜNG và chỉ còn hai giá trị — `MERGED` đã bị loại từ câu
 *   lệnh (xem `MobileCustomerService`), nên app không phải xử một trạng thái
 *   không bao giờ tới.
 * - `revenue` / `invoiceCount` là tổng hoá đơn bán ĐÃ CHỐT, tính sẵn ở server:
 *   màn danh sách sắp được theo doanh thu và có thanh "Tổng", hai thứ không
 *   làm được nếu client phải gọi `/customers/:id/summary` cho từng dòng.
 * - `groupName` / `cardTier` đã join sẵn — web chỉ có `groupId` và phải gọi
 *   thêm để ra tên nhóm và hạng thẻ. `cardTier` là TÊN do tổ chức đặt
 *   (`membership_card_types.name`), không phải mã enum: tập giá trị mở, app
 *   không dịch được và cũng không cần.
 *
 * Cố ý KHÔNG trả `nationalId`, `companyName`, `taxCode`, `assignedStaffId`,
 * `mergedIntoId`: app không hiển thị, và CCCD là dữ liệu định danh không nên
 * rời server khi chưa có màn nào cần.
 */
export class MobileCustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Mã khách hàng, duy nhất trong tổ chức' })
  code!: string;

  @ApiProperty({ description: 'Tên khách hàng, giữ nguyên hoa/thường đã nhập' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String })
  address!: string | null;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Ngày sinh dạng YYYY-MM-DD, không có giờ',
  })
  birthDate!: string | null;

  @ApiProperty({
    nullable: true,
    enum: ['male', 'female', 'unspecified'],
  })
  gender!: 'male' | 'female' | 'unspecified' | null;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({ nullable: true, type: String, description: 'Tên nhóm khách hàng' })
  groupName!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'TÊN hạng thẻ do tổ chức đặt (vd "Thẻ Vàng"); null khi chưa có thẻ hoặc thẻ hạng `none`',
  })
  cardTier!: string | null;

  @ApiProperty({
    description:
      'Tổng tiền hoá đơn bán đã chốt (paid / debt / partial_debt), đơn vị đồng',
  })
  revenue!: number;

  @ApiProperty({ description: 'Số hoá đơn bán đã chốt' })
  invoiceCount!: number;
}

/**
 * Một trang khách hàng. `limit` chứ không `pageSize` — gương theo
 * `/mobile/suppliers`.
 *
 * `totalRevenue` là tổng doanh thu của TOÀN tập khớp bộ lọc, không phải của
 * trang đang trả: thanh "Tổng" của app nằm trên danh sách cuộn vô tận, cộng
 * theo trang thì con số đổi mỗi lần chạm đáy.
 */
export class MobileCustomerPageDto {
  @ApiProperty({ type: [MobileCustomerResponseDto] })
  data!: MobileCustomerResponseDto[];

  @ApiProperty({
    description: 'Tổng số bản ghi khớp, không phải số bản ghi của trang',
  })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({
    description: 'Tổng doanh thu của toàn bộ bản ghi khớp bộ lọc',
  })
  totalRevenue!: number;
}

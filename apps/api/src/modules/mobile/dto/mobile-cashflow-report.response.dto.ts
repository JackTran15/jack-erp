import { ApiProperty } from '@nestjs/swagger';

/**
 * Bốn con số của màn "Tình hình thu chi" — khớp `CashflowSummaryEntity` phía
 * Dart, và khớp `openingBalance` / `closingBalance` / `totalDebit` /
 * `totalCredit` của "Sổ chi tiết tiền mặt" trên web.
 *
 * `closing` là số dư THẬT của quỹ đến hết ngày cuối kỳ, đọc từ sổ chứ không
 * suy `opening + income - expense` ở đây hay ở app: hai cách cho cùng một số
 * khi không lọc, nhưng đọc từ sổ thì ngày có sai lệch (dữ liệu hỏng, movement
 * lạ) người ta còn nhìn thấy nó.
 */
export class MobileCashflowSummaryDto {
  @ApiProperty({ description: 'Số dư quỹ tiền mặt TRƯỚC ngày đầu kỳ, đơn vị đồng, có thể ÂM' })
  opening!: number;

  @ApiProperty({ description: 'Số dư quỹ tiền mặt đến HẾT ngày cuối kỳ, đơn vị đồng, có thể ÂM' })
  closing!: number;

  @ApiProperty({ description: 'Tổng tiền VÀO quỹ trong kỳ, đơn vị đồng, ≥ 0' })
  income!: number;

  @ApiProperty({ description: 'Tổng tiền RA khỏi quỹ trong kỳ, đơn vị đồng, ≥ 0' })
  expense!: number;
}

/**
 * Một hạng mục thu/chi của một cửa hàng — khớp `CashflowCategoryEntity`.
 *
 * `id` và `name` cùng `null` ở đúng MỘT dòng mỗi cửa hàng (nếu có): phần tiền
 * không gắn được vào hạng mục nào — movement không có phiếu (chuyển quỹ, điều
 * chỉnh, tiền phiên POS), dòng phiếu chưa chọn hạng mục, hay phiếu đã bị xoá
 * mềm. App tự đặt nhãn cho dòng này.
 */
export class MobileCashflowCategoryDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  id!: string | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ description: 'Đơn vị đồng, > 0' })
  amount!: number;
}

/** Một cửa hàng trong màn "Tiền thu/chi theo cửa hàng" — khớp `CashflowStoreEntity`. */
export class MobileCashflowStoreDto {
  @ApiProperty({ format: 'uuid', description: 'id chi nhánh' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Tổng tiền theo chiều đã chọn, đơn vị đồng, > 0' })
  amount!: number;

  @ApiProperty({
    type: [MobileCashflowCategoryDto],
    description: 'Sắp theo tiền giảm dần; dòng "chưa xếp hạng mục" (id null) đứng cuối',
  })
  categories!: MobileCashflowCategoryDto[];
}

/**
 * Danh sách cửa hàng — KHÔNG phân trang: số cửa hàng được phân công là số
 * đếm được trên đầu ngón tay, và donut phía app cần trọn tập để chia tỷ trọng.
 * Chỉ trả cửa hàng CÓ phát sinh theo chiều đã chọn.
 */
export class MobileCashflowStoreListDto {
  @ApiProperty({ type: [MobileCashflowStoreDto] })
  data!: MobileCashflowStoreDto[];
}

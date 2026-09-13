import { ApiProperty } from '@nestjs/swagger';

/**
 * Ba con số của MỘT phạm vi (toàn chuỗi hoặc một chi nhánh) trong kỳ.
 *
 * `compareRevenue` là doanh thu THÔ của kỳ so sánh, không phải tỉ lệ tăng
 * trưởng tính sẵn: tỉ lệ của một tổng phải tính từ tổng hai vế, mà trung bình
 * các tỉ lệ từng chi nhánh thì không ra được điều đó — app tự chia. Bằng 0
 * khi query không có kỳ so sánh.
 */
export class MobileOverviewTotalsDto {
  @ApiProperty({ description: 'Doanh thu trong kỳ, công thức khớp "Doanh thu theo mặt hàng"' })
  revenue!: number;

  @ApiProperty({ description: 'Số hoá đơn đã ghi sổ trong kỳ, LOẠI hoá đơn huỷ, tính cả phiếu trả/đổi' })
  invoiceCount!: number;

  @ApiProperty({ description: 'Doanh thu của kỳ so sánh; 0 khi không gửi compareFrom/compareTo' })
  compareRevenue!: number;
}

/** Một chi nhánh trong Tổng quan — khớp `StoreRevenueEntity` phía Dart. */
export class MobileOverviewBranchDto extends MobileOverviewTotalsDto {
  @ApiProperty({ description: '`invoices.branch_id`; chi nhánh đã xoá vẫn có mặt nếu có phát sinh' })
  id!: string;

  @ApiProperty({ description: 'Tên chi nhánh; bằng `id` khi chi nhánh không còn trong danh mục' })
  name!: string;
}

/**
 * `GET /mobile/reports/overview`.
 *
 * `totals` do server chốt, app không cộng lại từ `branches` — cùng hợp đồng
 * `MobileBusinessReportResponseDto`. Hai bất biến được giữ:
 *
 * - `totals` = Σ `branches` = Σ mọi dòng hoá đơn trong phạm vi = tổng của
 *   `/mobile/reports/revenue/items` cùng kỳ cùng chi nhánh.
 * - Chi nhánh ACTIVE trong phạm vi mà KHÔNG phát sinh vẫn có mặt với số 0.
 */
export class MobileOverviewReportResponseDto {
  @ApiProperty({ type: MobileOverviewTotalsDto })
  totals!: MobileOverviewTotalsDto;

  @ApiProperty({
    type: [MobileOverviewBranchDto],
    description: 'Sắp theo doanh thu giảm dần, cùng doanh thu thì theo tên rồi id',
  })
  branches!: MobileOverviewBranchDto[];
}

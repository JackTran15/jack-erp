import { ApiProperty } from '@nestjs/swagger';

/** Ba chỉ số của báo cáo, đơn vị đồng. `profit` luôn = `revenue − cost`. */
export class MobileBusinessMetricsDto {
  @ApiProperty({ description: 'Doanh thu (mục II của "Kết quả kinh doanh")' })
  revenue!: number;

  @ApiProperty({ description: 'Chi phí (mục III): giá vốn + chi khác' })
  cost!: number;

  @ApiProperty({ description: 'Lợi nhuận (mục IV) = revenue − cost, có thể ÂM' })
  profit!: number;
}

/** Ba chỉ số của MỘT tháng dương lịch ở một chi nhánh. */
export class MobileBusinessMonthDto extends MobileBusinessMetricsDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ example: 9, minimum: 1, maximum: 12 })
  month!: number;
}

/**
 * Một chi nhánh trong báo cáo — khớp `BranchPerformanceEntity` phía Dart.
 *
 * `revenue`/`cost`/`profit` là tổng ĐÚNG kỳ `[from, to]` của query. `months`
 * là cửa sổ biểu đồ do server quyết (xem `MobileBusinessReportService`):
 * luôn đủ số tháng, tăng dần theo thời gian, tháng không phát sinh mang số 0
 * — app vẽ thẳng theo thứ tự này, không sắp lại và không tự điền.
 */
export class MobileBranchPerformanceDto extends MobileBusinessMetricsDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Địa chỉ chi nhánh; chuỗi rỗng khi chưa nhập' })
  address!: string;

  @ApiProperty({ type: [MobileBusinessMonthDto] })
  months!: MobileBusinessMonthDto[];
}

/**
 * `GET /mobile/reports/business`.
 *
 * `totals` là tổng của toàn phạm vi người dùng được xem — server chốt con số
 * này, app không cộng lại từ `branches` (cùng hợp đồng mà `totalAmount` của
 * `/mobile/invoices` đang giữ). Chi nhánh KHÔNG phát sinh gì trong kỳ vẫn có
 * mặt với số 0: thẻ tổng của app xếp hạng mọi chi nhánh, thiếu một là bảng
 * xếp hạng nói dối về số cửa hàng.
 */
export class MobileBusinessReportResponseDto {
  @ApiProperty({ type: MobileBusinessMetricsDto })
  totals!: MobileBusinessMetricsDto;

  @ApiProperty({
    type: [MobileBranchPerformanceDto],
    description: 'Sắp theo doanh thu giảm dần, cùng doanh thu thì theo tên',
  })
  branches!: MobileBranchPerformanceDto[];
}

import { ApiProperty } from '@nestjs/swagger';

/** Hai con số của TOÀN phạm vi trong kỳ, ở chế độ xem đang chọn. */
export class MobileRevenueEstimateTotalsDto {
  @ApiProperty({ description: 'Số đơn (hoá đơn) trong kỳ, loại nháp và huỷ' })
  orderCount!: number;

  @ApiProperty({
    description:
      'Doanh thu trong kỳ. Ở mọi chế độ trừ `payment`: công thức dòng hàng khớp "Doanh thu theo mặt hàng". Ở `payment`: Σ tiền của sáu phương thức — KHÁC doanh thu dòng hàng',
  })
  revenue!: number;
}

/**
 * Một dòng của danh sách — khớp `RevenueEstimateBucketEntity` phía Dart.
 *
 * `key` là định danh ỔN ĐỊNH của bucket, app dùng nó để tra nhãn:
 * - `time`: `yyyy-MM-dd` theo múi Postgres session (Asia/Ho_Chi_Minh);
 * - `status`: giá trị `invoices.status` (`pending`/`paid`/`debt`/`partial_debt`);
 * - `payment`: `unpaid`/`cash`/`card`/`bank_transfer`/`voucher`/`points`;
 * - `staff`: id (users.id hoặc employee_profiles.id tuỳ vai) hoặc `unassigned`;
 * - `channel`: `in_store`.
 *
 * `label` CHỈ có ở `staff` (tên nhân viên); các chế độ khác `null` vì nhãn là
 * việc của app (l10n). `unassigned` cũng `null` — app dịch.
 */
export class MobileRevenueEstimateBucketDto {
  @ApiProperty()
  key!: string;

  @ApiProperty({ nullable: true, type: String })
  label!: string | null;

  @ApiProperty({ description: 'Số đơn rơi vào bucket này' })
  orderCount!: number;

  @ApiProperty({ description: 'Tiền của bucket này; có thể ÂM (trả hàng)' })
  revenue!: number;
}

/**
 * `GET /mobile/reports/revenue-estimate`.
 *
 * `totals` = Σ `items`, server chốt, app không cộng lại. Ở `time`/`status`/
 * `staff`/`channel` mỗi hoá đơn rơi vào ĐÚNG MỘT bucket nên Σ `orderCount` là
 * số hoá đơn của phạm vi; ở `payment` một hoá đơn có thể ở nhiều bucket
 * (tiền mặt + điểm), nên Σ `orderCount` KHÔNG phải số hoá đơn — app chỉ hiện
 * tổng, không suy ngược.
 *
 * Chỉ bucket CÓ phát sinh mới có mặt (kể cả `channel`: không hoá đơn → rỗng).
 */
export class MobileRevenueEstimateResponseDto {
  @ApiProperty({ type: MobileRevenueEstimateTotalsDto })
  totals!: MobileRevenueEstimateTotalsDto;

  @ApiProperty({
    type: [MobileRevenueEstimateBucketDto],
    description:
      '`time`: tăng dần theo ngày; còn lại: doanh thu giảm dần, hoà thì theo nhãn rồi key',
  })
  items!: MobileRevenueEstimateBucketDto[];
}

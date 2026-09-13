import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { MobileRevenueReportQueryDto } from './mobile-revenue-report.query.dto';

/**
 * Query của `GET /mobile/reports/overview` — kỳ chính + chi nhánh kế thừa
 * `MobileRevenueReportQueryDto` (cùng tập dòng hoá đơn, cùng luật phạm vi),
 * thêm đúng một thứ: KỲ SO SÁNH.
 *
 * Kỳ so sánh do APP gửi tường minh, server KHÔNG suy "kỳ liền trước": màn bộ
 * lọc của app cho chọn kỳ so sánh tuỳ ý (kỳ trước, một ngày khác, hai mốc
 * gõ tay), nên "liền trước" chỉ là một trong nhiều ca — suy ở server là một
 * nguồn thứ hai cho cùng giá trị, cùng lý do `from`/`to` không có mặc định.
 *
 * `compareFrom`/`compareTo` phải đi ĐÔI: có một vế mà thiếu vế kia là 400
 * (kiểm ở service, vì class-validator không có ràng buộc liên trường sẵn).
 * Vắng cả hai = không so sánh, mọi `compareRevenue` trả 0.
 */
export class MobileOverviewReportQueryDto extends MobileRevenueReportQueryDto {
  /** Đầu kỳ so sánh, `YYYY-MM-DD`. Phải đi cùng `compareTo`. */
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  compareFrom?: string;

  /** Cuối kỳ so sánh, `YYYY-MM-DD`, bao trọn ngày cuối. Phải đi cùng `compareFrom`. */
  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  compareTo?: string;
}

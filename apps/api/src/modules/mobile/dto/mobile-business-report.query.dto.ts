import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

/**
 * Query của `GET /mobile/reports/business` — đúng HAI khoá, cả hai bắt buộc.
 *
 * Không có `branchIds`: màn "Tình hình kinh doanh" của app không có bộ lọc
 * cửa hàng, nó luôn bày mọi chi nhánh người dùng được xem (phạm vi quyết ở
 * `MobileBusinessReportService`). Không có khoá nào cho cửa sổ biểu đồ: số
 * tháng vẽ là hằng của server, app không được chọn — một nguồn cho một con số.
 */
export class MobileBusinessReportQueryDto {
  @ApiProperty({ example: '2026-09-01', description: 'Ngày đầu kỳ (yyyy-MM-dd)' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({
    example: '2026-09-30',
    description: 'Ngày cuối kỳ (yyyy-MM-dd), bao TRỌN ngày đó',
  })
  @IsISO8601({ strict: true })
  to!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MobileManagerInvoiceDateBasis } from './mobile-manager-invoice-list.query.dto';
import { MobileRevenueReportQueryDto } from './mobile-revenue-report.query.dto';

/**
 * Trục mà "Doanh thu ước tính" bổ dọc doanh thu theo — khớp `RevenueViewBy`
 * phía Dart (app tự dịch tên enum của nó sang chuỗi ở đây).
 *
 * `status` là TRẠNG THÁI HOÁ ĐƠN (`invoices.status`), không phải trạng thái
 * giao hàng: hệ không có cột giao hàng, và app hiện nhãn "Trạng thái giao
 * hàng" cho đúng trục này theo quyết định 2026-09-13. `channel` chỉ có một
 * bucket `in_store` — hệ không có cột kênh bán, mọi hoá đơn đều từ POS; giữ
 * trục để app không phải đổi khi backend có kênh thật.
 */
export enum MobileRevenueEstimateGroupBy {
  TIME = 'time',
  STATUS = 'status',
  PAYMENT = 'payment',
  STAFF = 'staff',
  CHANNEL = 'channel',
}

/**
 * Vai nhân viên khi `groupBy = staff` — ba cột khác nhau của `invoices`:
 * `creator` → `created_by` (users), `salesperson` → `salesperson_id`
 * (employee_profiles), `cashier` → `staff_id` (users). Web "Bảng kê hoá đơn"
 * gọi `staff_id` là thu ngân và `salesperson_id` là NV bán hàng — giữ đúng
 * cách gọi đó.
 */
export enum MobileRevenueEstimateStaffRole {
  CREATOR = 'creator',
  SALESPERSON = 'salesperson',
  CASHIER = 'cashier',
}

/**
 * Query của `GET /mobile/reports/revenue-estimate` — kỳ + chi nhánh kế thừa
 * `MobileRevenueReportQueryDto`, thêm ba trục của bộ lọc app.
 *
 * `dateBasis` và `groupBy` BẮT BUỘC, không mặc định: cả hai là thứ người dùng
 * vừa chọn ở bộ lọc, server đoán hộ là một nguồn thứ hai cho cùng giá trị —
 * cùng luật `unit` của timeline. `dateBasis` tái dùng enum của danh sách hoá
 * đơn vì cùng hai mốc (`created` = ngày tạo đơn, `issued` = ngày ghi sổ; app
 * gọi mốc sau là "ngày hoàn thành" — hệ không có `completed_at`).
 *
 * `staffRole` đi ĐÔI với `groupBy = staff`: có mà không phải staff, hoặc staff
 * mà thiếu, đều 400 (kiểm ở service, class-validator không có ràng buộc liên
 * trường sẵn — cùng chỗ `compareFrom`/`compareTo` của overview).
 */
export class MobileRevenueEstimateQueryDto extends MobileRevenueReportQueryDto {
  @ApiProperty({ enum: MobileManagerInvoiceDateBasis })
  @IsEnum(MobileManagerInvoiceDateBasis)
  dateBasis!: MobileManagerInvoiceDateBasis;

  @ApiProperty({ enum: MobileRevenueEstimateGroupBy })
  @IsEnum(MobileRevenueEstimateGroupBy)
  groupBy!: MobileRevenueEstimateGroupBy;

  @ApiPropertyOptional({ enum: MobileRevenueEstimateStaffRole })
  @IsOptional()
  @IsEnum(MobileRevenueEstimateStaffRole)
  staffRole?: MobileRevenueEstimateStaffRole;
}

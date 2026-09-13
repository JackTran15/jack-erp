import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MobileCustomerOrder } from './mobile-customer-list.query.dto';
import { MobileRevenueItemListQueryDto } from './mobile-revenue-report.query.dto';

/**
 * Tiêu chí sắp xếp của `GET /mobile/reports/debts/customers` — khớp ba mục
 * "Sắp xếp theo" của màn Công nợ: tên (asc), nợ giảm dần, nợ tăng dần. Chiều
 * đi ở `order` (tái dùng `MobileCustomerOrder`) chứ không nhân đôi enum thành
 * `debtDesc`/`debtAsc` — cùng khuôn `MobileCustomerSort`.
 */
export enum MobileCustomerDebtSort {
  NAME = 'name',
  DEBT = 'debt',
}

/**
 * Query của `GET /mobile/reports/debts/customers`.
 *
 * Kế thừa `MobileRevenueItemListQueryDto` để lấy trọn bộ `from`/`to` BẮT BUỘC,
 * `branchIds`, `page`/`limit` — cùng tiền lệ `MobileOverviewReportQueryDto`
 * kế thừa chéo báo cáo. Thêm đúng ba trục mà màn Công nợ cần và báo cáo doanh
 * thu không có: tìm kiếm, tiêu chí sắp xếp, chiều sắp xếp.
 *
 * Kỳ ở đây có nghĩa KHÁC báo cáo doanh thu: nó không lọc dòng mà cắt sổ —
 * nợ CUỐI KỲ = mọi phát sinh tới hết `to`. `from` chỉ tách phần "đầu kỳ" khỏi
 * phần "trong kỳ" và hiện app chỉ dùng tổng của hai phần.
 */
export class MobileCustomerDebtListQueryDto extends MobileRevenueItemListQueryDto {
  /** Tìm theo mã, tên hoặc số điện thoại khách — server tra, app không đoán trường. */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    enum: MobileCustomerDebtSort,
    default: MobileCustomerDebtSort.NAME,
  })
  @IsOptional()
  @IsEnum(MobileCustomerDebtSort)
  sort?: MobileCustomerDebtSort = MobileCustomerDebtSort.NAME;

  @ApiPropertyOptional({
    enum: MobileCustomerOrder,
    default: MobileCustomerOrder.ASC,
  })
  @IsOptional()
  @IsEnum(MobileCustomerOrder)
  order?: MobileCustomerOrder = MobileCustomerOrder.ASC;
}

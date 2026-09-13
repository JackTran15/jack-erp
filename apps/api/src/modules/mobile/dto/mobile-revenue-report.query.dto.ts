import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Mức gộp của chuỗi thời gian ở `GET /mobile/reports/revenue/timeline` —
 * khớp `RevenueTimeUnit` phía Dart, giá trị là chuỗi `name` của enum đó.
 *
 * `hour`/`weekday` KHÔNG phải một trục thời gian liên tục: chúng gộp MỌI ngày
 * của kỳ về 24 giờ trong ngày / 7 thứ trong tuần ("giờ nào bán chạy"). Bốn mức
 * còn lại là các mốc liên tiếp trong kỳ.
 */
export enum MobileRevenueTimeUnit {
  HOUR = 'hour',
  WEEKDAY = 'weekday',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

/** Chuỗi đơn -> mảng một phần tử, để `?branchIds=a` và `?branchIds=a&branchIds=b` cùng hợp lệ. */
const toArray = () =>
  Transform(({ value }) => (Array.isArray(value) ? value : [value]));

/**
 * Query gốc của mọi endpoint `/mobile/reports/revenue/*`: kỳ BẮT BUỘC, chi
 * nhánh tuỳ chọn.
 *
 * `from`/`to` bắt buộc chứ không mặc định "tháng này": màn app luôn có một kỳ
 * đang chọn, và một mặc định phía server là một nguồn thứ hai cho cùng giá trị
 * — cùng lý do `MobileBusinessReportQueryDto` đòi đủ hai đầu.
 *
 * `branchIds` vắng = mọi chi nhánh người dùng được PHÂN CÔNG — luật ở
 * `resolveReportBranchScope` (mobile không có vế hợp nhất).
 */
export class MobileRevenueReportQueryDto {
  /** Đầu kỳ, `YYYY-MM-DD`, tính theo ngày ghi sổ `issued_at`. Bao gồm trọn ngày. */
  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  from!: string;

  /** Cuối kỳ, `YYYY-MM-DD`. Bao gồm TRỌN ngày cuối, không phải 00:00 của nó. */
  @ApiProperty({ example: '2026-09-30' })
  @IsISO8601({ strict: true })
  to!: string;

  /** Thu hẹp theo cửa hàng. Vắng = mọi cửa hàng được xem. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

/**
 * Query của `GET /mobile/reports/revenue/items` — trang 1 của màn, có phân
 * trang thật vì một cửa hàng bán vài trăm mẫu mã trong một năm.
 *
 * Không có `sort`: màn không có nhóm sắp xếp, server cố định doanh thu giảm
 * dần. Không có `search`: nút tìm kiếm ở header app còn là `comingSoon`; thêm
 * khoá vào DTO khi chưa ai gửi là dựng sẵn thứ chưa dùng.
 */
export class MobileRevenueItemListQueryDto extends MobileRevenueReportQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Query của `GET /mobile/reports/revenue/timeline` — thêm đúng một trục: mức gộp. */
export class MobileRevenueTimelineQueryDto extends MobileRevenueReportQueryDto {
  /** BẮT BUỘC, không mặc định: mức là thứ người dùng vừa chọn ở bộ lọc, server không đoán hộ. */
  @ApiProperty({ enum: MobileRevenueTimeUnit })
  @IsEnum(MobileRevenueTimeUnit)
  unit!: MobileRevenueTimeUnit;
}

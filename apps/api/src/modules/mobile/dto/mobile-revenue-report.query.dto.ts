import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
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
 * Kỳ + cửa hàng + PHÂN TRANG — phần dùng chung của những báo cáo trả danh sách
 * dài. Tách khỏi [MobileRevenueItemListQueryDto] khi báo cáo Công nợ cũng cần
 * đúng năm khoá này: trước đó nó kế thừa thẳng DTO của báo cáo doanh thu, và
 * ngày doanh thu mọc thêm `search` thì hai ô tìm mang HAI nghĩa khác nhau va
 * vào nhau (TS2612).
 *
 * Đặt ở file này chứ không tách file riêng: nó là phần mở rộng trực tiếp của
 * [MobileRevenueReportQueryDto] ngay trên, và tách ra thì đọc một khuôn phải
 * mở hai file.
 */
export class MobilePagedReportQueryDto extends MobileRevenueReportQueryDto {
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

/**
 * Query của `GET /mobile/reports/revenue/items` — trang 1 của màn, có phân
 * trang thật vì một cửa hàng bán vài trăm mẫu mã trong một năm.
 *
 * Không có `sort`: màn không có nhóm sắp xếp, server cố định doanh thu giảm
 * dần.
 *
 * `search` là khoá RIÊNG của đường này — năm endpoint còn lại của nhóm
 * (`categories`, `timeline`, ba màn con) không có ô tìm, và tập khoá của cả
 * nhóm là ĐÓNG (`forbidNonWhitelisted`) nên gửi sang đó là 400. Vì vậy nó khai
 * ở lớp CON chứ không ở [MobileRevenueReportQueryDto] hay
 * [MobilePagedReportQueryDto].
 */
export class MobileRevenueItemListQueryDto extends MobilePagedReportQueryDto {
  /**
   * Ô tìm ở header màn "Doanh thu theo mặt hàng": mã/tên MẪU MÃ và tên NHÓM
   * hàng hoá, khớp chuỗi con, không phân biệt hoa thường.
   *
   * **Cố ý KHÔNG tìm trên mã/tên BIẾN THỂ** — grain của đường này là mẫu mã
   * (web `statBy=parent`), và web loại hai cột đó ở đúng grain này vì gõ `"1"`
   * khớp một biến thể sẽ kéo nguyên mẫu mã lên. Xem `revenue-by-item.report.ts`.
   *
   * Rỗng / toàn khoảng trắng = không lọc gì, y như vắng khoá.
   */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

/** Query của `GET /mobile/reports/revenue/timeline` — thêm đúng một trục: mức gộp. */
export class MobileRevenueTimelineQueryDto extends MobileRevenueReportQueryDto {
  /** BẮT BUỘC, không mặc định: mức là thứ người dùng vừa chọn ở bộ lọc, server không đoán hộ. */
  @ApiProperty({ enum: MobileRevenueTimeUnit })
  @IsEnum(MobileRevenueTimeUnit)
  unit!: MobileRevenueTimeUnit;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
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
 * Trạng thái hoá đơn theo cách app nhìn — BA giá trị, không phải sáu của
 * `InvoiceStatus` backend. App gộp `debt` và `partial_debt` thành "chưa thu
 * tiền", còn `draft`/`pending` không bao giờ tới app (chưa ghi sổ). Bảng ánh
 * xạ hai chiều nằm ở `MobileManagerInvoiceService`.
 */
export enum MobileManagerInvoiceStatus {
  PAID = 'paid',
  UNPAID = 'unpaid',
  CANCELLED = 'cancelled',
}

/** Chiều sắp xếp theo thời gian — màn lịch sử mua có hai mục tăng/giảm. */
export enum MobileManagerInvoiceOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Mốc thời gian mà cả khoảng lọc lẫn thứ tự sắp xếp bám vào: ngày TẠO hay
 * ngày GHI SỔ (`issued_at`). Màn lịch sử mua của app có nhóm "Xem theo" với
 * đúng hai lựa chọn này.
 */
export enum MobileManagerInvoiceDateBasis {
  CREATED = 'created',
  ISSUED = 'issued',
}

/** Chuỗi đơn -> mảng một phần tử, để `?status=paid` và `?status=paid&status=unpaid` cùng hợp lệ. */
const toArray = () =>
  Transform(({ value }) => (Array.isArray(value) ? value : [value]));

/**
 * Query của `GET /mobile/manager/invoices` và `GET /mobile/customers/:id/invoices` —
 * cùng một DTO, khác nhau đúng ở khoá khách hàng đi trên đường dẫn.
 */
export class MobileManagerInvoiceListQueryDto {
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

  @ApiPropertyOptional({
    enum: MobileManagerInvoiceOrder,
    default: MobileManagerInvoiceOrder.DESC,
    description: 'Mặc định mới nhất lên đầu',
  })
  @IsOptional()
  @IsEnum(MobileManagerInvoiceOrder)
  order?: MobileManagerInvoiceOrder = MobileManagerInvoiceOrder.DESC;

  @ApiPropertyOptional({
    enum: MobileManagerInvoiceDateBasis,
    default: MobileManagerInvoiceDateBasis.CREATED,
  })
  @IsOptional()
  @IsEnum(MobileManagerInvoiceDateBasis)
  dateBasis?: MobileManagerInvoiceDateBasis = MobileManagerInvoiceDateBasis.CREATED;

  /** Đầu kỳ, `YYYY-MM-DD`, tính theo `dateBasis`. Bao gồm trọn ngày. */
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Cuối kỳ, `YYYY-MM-DD`. Bao gồm TRỌN ngày cuối, không phải 00:00 của nó. */
  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /**
   * Lọc theo tập trạng thái. Vắng = mọi hoá đơn đã ghi sổ.
   *
   * Nhận MẢNG (`?status=paid&status=unpaid`): màn lọc cho tick nhiều trạng
   * thái cùng lúc, và tab Hoá đơn chỉ gửi một — cùng một khoá cho cả hai.
   */
  @ApiPropertyOptional({ enum: MobileManagerInvoiceStatus, isArray: true })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsEnum(MobileManagerInvoiceStatus, { each: true })
  status?: MobileManagerInvoiceStatus[];

  /** Thu hẹp theo cửa hàng. Vắng = toàn chuỗi. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  branchIds?: string[];

  /** Tìm theo số hoá đơn. KHÔNG bỏ dấu — cùng luật mọi ô tìm mobile. */
  @ApiPropertyOptional({ example: 'INV-202607' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

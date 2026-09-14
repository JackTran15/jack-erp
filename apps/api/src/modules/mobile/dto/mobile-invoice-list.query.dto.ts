import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Ba trạng thái mà app bày — KHÔNG phải sáu giá trị của `InvoiceStatus`. Ánh
 * xạ về giá trị thật nằm ở `MobileInvoiceService`, cùng chỗ với ánh xạ chiều
 * đọc của app (`InvoiceModel`), để hai chiều không phân kỳ.
 */
export const MOBILE_INVOICE_STATUS_FILTERS = ['paid', 'unpaid', 'cancelled'] as const;
export type MobileInvoiceStatusFilter = (typeof MOBILE_INVOICE_STATUS_FILTERS)[number];

/**
 * Bộ lọc màn **Danh sách hoá đơn** của app.
 *
 * Sáu tham số, và đó là toàn bộ thứ màn đó có: khoảng ngày của hàng lọc kỳ,
 * ô tìm ở header, bộ lọc trạng thái, cộng phân trang.
 *
 * **KHÔNG có `salespersonId`.** Phạm vi *"chỉ hoá đơn của mình"* do SERVER ép
 * từ hồ sơ nhân viên của người gọi (ADR-24). Phơi trường đó ra đây là biến một
 * ràng buộc thành một lời hứa của client — và client thì sửa được.
 *
 * `forbidNonWhitelisted: true` bật toàn cục, nên gửi thừa một khoá là **400 cho
 * cả lượt gọi**. Đó là hiệu lực mong muốn: ai đó thử `?salespersonId=...` sẽ
 * nhận một lỗi rõ ràng thay vì một danh sách không phải của mình.
 */
export class MobileInvoiceListQueryDto {
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

  /**
   * Đầu kỳ, ISO-8601. Lọc theo `createdAt` — cùng trường mà màn Lịch sử đơn
   * hàng dùng, nên hai màn nói về cùng một mốc thời gian.
   */
  @ApiPropertyOptional({ description: 'ISO-8601, đầu kỳ (bao gồm)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  /**
   * Cuối kỳ, ISO-8601, **bao gồm**. Client đẩy nó tới 23:59:59.999 của ngày
   * cuối — nếu nó là 00:00 thì mọi hoá đơn lập trong ngày cuối rơi ra ngoài, và
   * lỗi đó KHÔNG lộ ở kỳ *Hôm nay*.
   */
  @ApiPropertyOptional({ description: 'ISO-8601, cuối kỳ (bao gồm)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Ô tìm ở header màn Danh sách hoá đơn: khớp SỐ HOÁ ĐƠN, TÊN hoặc SĐT khách
   * — ba cột mà lưới nháp của POS cũng tìm, nên gõ gì ở app ra đúng thứ POS ra.
   */
  @ApiPropertyOptional({ maxLength: 200, description: 'Số hoá đơn, tên hoặc SĐT khách' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Lọc trạng thái, MẢNG: `?status[]=paid&status[]=unpaid`. Một giá trị đơn
   * (`?status=paid`) cũng được — `Transform` bọc nó thành mảng, cùng khuôn với
   * `kinds` của `/mobile/counterparties`.
   */
  @ApiPropertyOptional({ enum: MOBILE_INVOICE_STATUS_FILTERS, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsIn(MOBILE_INVOICE_STATUS_FILTERS, { each: true })
  status?: MobileInvoiceStatusFilter[];
}

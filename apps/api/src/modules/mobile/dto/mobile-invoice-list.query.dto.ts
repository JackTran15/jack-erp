import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/**
 * Bộ lọc màn **Danh sách hoá đơn** của app.
 *
 * Bốn tham số, và đó là toàn bộ thứ màn đó có: khoảng ngày của hàng lọc kỳ,
 * cộng phân trang.
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
}

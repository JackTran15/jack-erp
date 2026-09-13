import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportGroupBy } from '@erp/shared-interfaces';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/** Hai chế độ gộp mà màn của app bày: *Mẫu mã* và *Nhóm hàng hóa*. */
export type MobileRevenueGroupBy = ReportGroupBy.PARENT | ReportGroupBy.GROUP;

/**
 * Bộ lọc màn **Doanh thu theo mặt hàng**.
 *
 * Bốn tham số. Báo cáo gốc (`InvoiceReportSearchDto` + `InvoiceReportFilterDto`)
 * nhận khoảng hai mươi — cột hiển thị, bộ lọc theo cột, thương hiệu, loại hàng,
 * phạm vi nhiều cửa hàng… Màn của app không có lối vào cho thứ nào trong số đó,
 * và phơi chúng ra là mời client tự dựng một báo cáo khác.
 *
 * **KHÔNG có `reportType`.** Server đặt cứng `revenue-by-item`. Nhận nó từ
 * client là biến đường này thành một cửa chạy MỌI báo cáo — và quyền ở đây chỉ
 * đủ cho đúng một cái.
 *
 * **KHÔNG có `salespersonId`** — và ở đây nó KHÔNG có nghĩa là "server ép".
 * Báo cáo `revenue-by-item` **bỏ qua** bộ lọc đó (đo được trên API thật); màn
 * này vì thế theo phạm vi CHI NHÁNH. Xem doc của `MobileProductRevenueService`.
 */
export class MobileProductRevenueQueryDto {
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
   * Đầu kỳ, ISO-8601. **BẮT BUỘC** — báo cáo gốc trả
   * `400 filters.issuedAt.from is required` khi thiếu, và để client phát hiện
   * điều đó bằng một lỗi đến từ tầng nó không biết tới là tệ hơn nhiều so với
   * một lỗi nói đúng tên tham số của chính đường này.
   */
  @ApiProperty({ description: 'ISO-8601, đầu kỳ (bao gồm)' })
  @IsISO8601()
  from!: string;

  /** Cuối kỳ, ISO-8601, BAO GỒM. Nơi gọi đẩy tới 23:59:59.999 của ngày cuối. */
  @ApiProperty({ description: 'ISO-8601, cuối kỳ (bao gồm)' })
  @IsISO8601()
  to!: string;

  /**
   * Grain của một dòng. `parent` = **mẫu mã** (sản phẩm cha), `group` = **nhóm
   * hàng hóa**.
   *
   * `item` — grain BIẾN THỂ — cố ý không nhận: nút gạt của bản gốc chỉ có hai
   * nấc, và một giá trị thứ ba đi lọt sẽ cho ra một danh sách mà không nấc nào
   * trên màn ứng với nó.
   */
  @ApiPropertyOptional({ enum: [ReportGroupBy.PARENT, ReportGroupBy.GROUP], default: ReportGroupBy.PARENT })
  @IsOptional()
  @IsIn([ReportGroupBy.PARENT, ReportGroupBy.GROUP])
  statBy?: MobileRevenueGroupBy = ReportGroupBy.PARENT;
}

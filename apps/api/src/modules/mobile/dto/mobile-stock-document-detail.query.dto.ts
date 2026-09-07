import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MobileStockDocumentKind } from './mobile-stock-document-list.query.dto';

/**
 * Query của `GET /mobile/stock-documents/:id`.
 *
 * `kind` là **BẮT BUỘC**, không phải tuỳ chọn, và không suy ra được từ `id`:
 * hai loại chứng từ nằm ở hai BẢNG khác nhau (`goods_receipts` và
 * `goods_issues`), nên không có `id` thôi thì backend không biết tra ở đâu. Dò
 * lần lượt cả hai bảng cũng không phải đường ra: hai bảng có hai QUYỀN khác
 * nhau, và một lượt dò sẽ nói cho người không có quyền biết một `id` nào đó có
 * tồn tại hay không.
 *
 * Nó còn mang nghĩa thứ hai, và đây mới là chỗ dễ bỏ sót: `goods-receipt` và
 * `stock-in` **cùng một bảng**, phân biệt bằng `purpose`. Service kiểm lại
 * purpose có thuộc `kind` không rồi mới trả — nếu không, đường dẫn của màn Nhập
 * kho sẽ mở được một phiếu mua hàng và hiển thị nó dưới tiêu đề "Nhập kho".
 */
export class MobileStockDocumentDetailQueryDto {
  @ApiProperty({ enum: MobileStockDocumentKind })
  @IsEnum(MobileStockDocumentKind)
  kind!: MobileStockDocumentKind;

  /** Cửa hàng chứa chứng từ. Xem ghi chú ở DTO danh sách. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

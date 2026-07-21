import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Kết quả tra cứu hàng hóa theo mã (SKU hoặc mã vạch) cho ô quét mã vạch ở
 * form Nhập/Xuất/Chuyển kho. Shape trùng phần lõi của item mà picker trả về
 * (ProductSelectDialog) để form tái dùng đường thêm dòng; vị trí resolve riêng.
 */
export class ItemLookupResultDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) productId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() purchasePrice: number;
  @ApiProperty() sellingPrice: number;
  @ApiPropertyOptional({ nullable: true }) variantLabel: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;
}

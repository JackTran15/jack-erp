import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { MobileInventoryKind } from './mobile-inventory-product-list.query.dto';

/**
 * Query của các đường drill-down có CHI NHÁNH TRÊN ĐƯỜNG DẪN
 * (`GET /mobile/inventory/products/:id/stores/:branchId`, và
 * `GET /mobile/inventory/stores/:branchId`): chỉ còn mốc ngày và loại tồn,
 * KHÔNG có `branchIds` — chi nhánh đã ở path, nhận thêm ở query là hai nguồn
 * cho một sự thật.
 */
export class MobileInventoryFlowQueryDto {
  /** Tồn tính đến hết ngày; kỳ nhập-xuất = đầu tháng của ngày này -> ngày này. */
  @ApiPropertyOptional({ example: '2026-09-11' })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({
    enum: MobileInventoryKind,
    default: MobileInventoryKind.ON_HAND,
  })
  @IsOptional()
  @IsEnum(MobileInventoryKind)
  kind?: MobileInventoryKind = MobileInventoryKind.ON_HAND;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { InventoryReportQueryDto } from './inventory-report-query.dto';

/**
 * Báo cáo 7 — Hàng hóa điều chuyển theo cửa hàng.
 *
 * Extends the shared inventory-report query with a `sourceBranchId` (UUID)
 * — the source branch whose outgoing transfers we want to list, grouped by
 * destination branch. If omitted the service falls back to the actor's
 * current branch (from `X-Branch-Id`); if that's also absent we 400.
 */
export class TransferByBranchQueryDto extends InventoryReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Cửa hàng xuất (UUID). Bắt buộc gián tiếp — nếu bỏ trống sẽ dùng X-Branch-Id của request.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  sourceBranchId?: string;
}

import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Server-side pagination over the lines of ONE stock transfer — the transfer-side
 * twin of `GoodsReceiptLineSearchV2Dto`, deliberately smaller (ADR-04).
 *
 * The detail panel ("Chi tiết") only paginates in this phase — no column
 * filters — so this DTO carries no filter fields. `forbidNonWhitelisted` on the
 * global `ValidationPipe` means any extra body field 400s rather than being
 * silently ignored.
 */
export class StockTransferLineSearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

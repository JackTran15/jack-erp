import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosDailySummaryDto } from './pos-daily-summary.dto';

/**
 * Export request — same filters as the JSON summary, plus the FE-only "Bàn
 * giao tiền" handover form snapshot and the already-resolved Thu ngân/NVBH
 * filter labels. Neither has any other source on the backend: the handover
 * form is never persisted, and the labels are already resolved client-side
 * for the toolbar selects. Branch name/address, "Người lập", and "Ngày lập"
 * are resolved server-side instead of trusted from the client.
 */
export class PosDailySummaryExportDto extends PosDailySummaryDto {
  @ApiPropertyOptional({ description: 'Resolved "Thu ngân" filter label ("Tất cả" when unset).' })
  @IsOptional()
  @IsString()
  cashierLabel?: string;

  @ApiPropertyOptional({ description: 'Resolved "NVBH" filter label ("Tất cả" when unset).' })
  @IsOptional()
  @IsString()
  nvbhLabel?: string;

  @ApiPropertyOptional({ description: 'Tiền nhận bàn giao (opening cash) — FE-only, unpersisted.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingAmount?: number;

  @ApiPropertyOptional({
    description:
      'Tiền bàn giao (handover cash) — FE-only, unpersisted. Can go negative (chênh lệch âm khi chi vượt thu tiền mặt), same as the print flow which applies no such floor.',
  })
  @IsOptional()
  @IsNumber()
  handoverAmount?: number;

  @ApiPropertyOptional({ description: 'Người nhận bàn giao (resolved staff name) — FE-only.' })
  @IsOptional()
  @IsString()
  receivedByLabel?: string;

  @ApiPropertyOptional({ description: 'Ghi chú bàn giao.' })
  @IsOptional()
  @IsString()
  note?: string;
}

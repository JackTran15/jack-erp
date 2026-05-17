import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
} from '@erp/shared-interfaces';

export class ListTempWarehouseLinesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'When true, return 1 aggregated row per item with totals + net direction',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hideOffsetting?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Filter by line status; use ALL to return every status. TRANSFERRED lines are always excluded — query stock_transfers via temp_warehouse_lines.transfer_id for that audit trail.',
    enum: [
      ...Object.values(TempWarehouseLineStatus).filter(
        (s) => s !== TempWarehouseLineStatus.TRANSFERRED,
      ),
      'ALL',
    ],
    default: TempWarehouseLineStatus.ACTIVE,
  })
  @IsOptional()
  @IsString()
  status?: Exclude<TempWarehouseLineStatus, TempWarehouseLineStatus.TRANSFERRED> | 'ALL';

  @ApiPropertyOptional({ enum: TempWarehouseDirection })
  @IsOptional()
  @IsEnum(TempWarehouseDirection)
  direction?: TempWarehouseDirection;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50;

  @ApiPropertyOptional({
    description:
      'Hide items whose totalW2s equals totalS2w. Requires hideOffsetting=true; otherwise 400.',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hideBalanced?: boolean = false;
}

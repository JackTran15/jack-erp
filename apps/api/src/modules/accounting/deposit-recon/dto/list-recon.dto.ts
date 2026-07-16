import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ReconStatus } from '@erp/shared-interfaces';

/**
 * Grid đối chiếu tiền gửi (FR-09). `dateFrom`/`dateTo` filter on `value_date`
 * (R2, TKT-DFR-04) — a statement date matches the movement's cleared date, not
 * its transaction date, so there is no "false discrepancy" from unsettled funds.
 */
export class ListReconDto {
  @ApiPropertyOptional({ description: 'Số tài khoản — filters to one deposit account' })
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  @ApiPropertyOptional({ enum: ReconStatus, default: ReconStatus.CHUA })
  @IsOptional()
  @IsEnum(ReconStatus)
  reconStatus?: ReconStatus;

  @ApiPropertyOptional({ description: 'value_date >=' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'value_date <=' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docNumber?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

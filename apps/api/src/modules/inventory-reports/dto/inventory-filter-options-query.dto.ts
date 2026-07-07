import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Query params for the inventory report dropdown filter-options endpoint. */
export class InventoryFilterOptionsQueryDto {
  /** Which dropdown to load (store, warehouse, productGroup, …). */
  @IsEnum(ReportFilterOptionType)
  type: ReportFilterOptionType;

  /** Optional case-insensitive partial search (dynamic types only). */
  @IsOptional()
  @IsString()
  search?: string;

  /** Restrict `warehouse` options to these branches (always ∩ actor branches). */
  @ApiPropertyOptional({
    type: [String],
    description: 'Branch ids to restrict warehouse options to',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

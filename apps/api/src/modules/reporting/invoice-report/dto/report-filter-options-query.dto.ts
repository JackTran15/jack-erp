import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query params for the shared dropdown filter-options endpoint. */
export class ReportFilterOptionsQueryDto {
  /** Which dropdown to load (store, cashier, invoiceStatus, …). */
  @IsEnum(ReportFilterOptionType)
  type: ReportFilterOptionType;

  /** Optional case-insensitive partial search (dynamic types only). */
  @IsOptional()
  @IsString()
  search?: string;

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

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ColumnFilterDto } from './column-filter.dto';
import { DebtReportFilterDto } from './debt-report-filter.dto';

export class DebtReportSearchDto {
  /** Which backend report definition to run. */
  @IsString()
  reportType: string;

  /** Selected column keys (fixed registry keys only — debt reports have no dynamic columns). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columns: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => DebtReportFilterDto)
  filters: DebtReportFilterDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnFilterDto)
  columnFilters?: ColumnFilterDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}

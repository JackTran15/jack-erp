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
import { CashFundReportFilterDto } from './cash-fund-report-filter.dto';
import { ColumnFilterDto } from './column-filter.dto';

export class CashFundReportSearchDto {
  /** Which backend report definition to run (CASH_FUND_REPORT_KEYS). */
  @IsString()
  reportType: string;

  /** Selected column keys (fixed registry keys only — cash-fund reports have no dynamic columns). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columns: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => CashFundReportFilterDto)
  filters: CashFundReportFilterDto;

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

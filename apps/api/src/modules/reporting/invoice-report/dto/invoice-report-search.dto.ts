import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ColumnFilterDto } from './column-filter.dto';
import { InvoiceReportFilterDto } from './invoice-report-filter.dto';

export class InvoiceReportSearchDto {
  /** Which backend report definition to run. */
  @IsString()
  reportType: string;

  /** Selected column keys (fixed registry keys + dynamic `payment.method.<coaAccountId>`). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columns: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => InvoiceReportFilterDto)
  filters: InvoiceReportFilterDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnFilterDto)
  columnFilters?: ColumnFilterDto[];

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  limit?: number = 31;
}

import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { ColumnFilterDto } from './column-filter.dto';
import { InvoiceReportFilterDto } from './invoice-report-filter.dto';
import { ReportTemplateColumnDto } from './report-template-column.dto';

export class UpdateInvoiceReportTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateColumnDto)
  columns?: ReportTemplateColumnDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceReportFilterDto)
  filters?: InvoiceReportFilterDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnFilterDto)
  columnFilters?: ColumnFilterDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

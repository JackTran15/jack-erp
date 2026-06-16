import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
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

export class CreateInvoiceReportTemplateDto {
  @IsString()
  @Length(1, 80)
  reportType: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateColumnDto)
  columns: ReportTemplateColumnDto[];

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

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
import { DebtReportFilterDto } from './debt-report-filter.dto';
import { ReportTemplateColumnDto } from './report-template-column.dto';

export class UpdateDebtReportTemplateDto {
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
  @Type(() => DebtReportFilterDto)
  filters?: DebtReportFilterDto;

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

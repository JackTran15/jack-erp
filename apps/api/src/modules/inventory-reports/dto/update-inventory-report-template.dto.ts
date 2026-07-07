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
import { ColumnFilterDto } from '../../reporting/invoice-report/dto/column-filter.dto';
import { ReportTemplateColumnDto } from '../../reporting/invoice-report/dto/report-template-column.dto';
import { InventoryReportFilterDto } from './inventory-report-filter.dto';

export class UpdateInventoryReportTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateColumnDto)
  columns?: ReportTemplateColumnDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InventoryReportFilterDto)
  filters?: InventoryReportFilterDto;

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

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
import { ColumnFilterDto } from '../../reporting/invoice-report/dto/column-filter.dto';
import { InventoryReportFilterDto } from './inventory-report-filter.dto';

export class InventoryReportSearchDto {
  /** Which backend report definition to run (see INVENTORY_REPORT_KEYS). */
  @IsString()
  reportType: string;

  /** Selected column keys (fixed keys + dynamic `branch.qty.<branchId>` for the pivot). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columns: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => InventoryReportFilterDto)
  filters: InventoryReportFilterDto;

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
  limit?: number = 20;
}

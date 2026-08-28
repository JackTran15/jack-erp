import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { ColumnFilterDto } from '../../reporting/invoice-report/dto/column-filter.dto';
import { ReportTemplateColumnDto } from '../../reporting/invoice-report/dto/report-template-column.dto';
import { TemplateScope } from '@erp/shared-interfaces';
import { InventoryReportFilterDto } from './inventory-report-filter.dto';

export class CreateInventoryReportTemplateDto {
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

  /**
   * Which tier to write to. Must be declared by the client: the backoffice sends
   * `X-Branch-Id` even in chain view, so the server cannot tell the two apart
   * (ADR-02). Omitted ⇒ branch tier when the actor has a branch.
   */
  @ApiPropertyOptional({ enum: ['chain', 'branch'] })
  @IsOptional()
  @IsIn(['chain', 'branch'])
  scope?: TemplateScope;
}

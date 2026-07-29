import { IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Per-column filter applied POST-aggregate on a drill-down row's value.
 * Mirrors invoice-report/dto/column-filter.dto.ts (each reporting submodule
 * keeps its own copy rather than depending on another submodule's DTOs).
 */
export class ColumnFilterDto {
  @IsString()
  col: string;

  @IsOptional()
  eq?: number | string;

  @IsOptional()
  @IsNumber()
  lt?: number;

  @IsOptional()
  @IsNumber()
  lte?: number;

  @IsOptional()
  @IsNumber()
  gt?: number;

  @IsOptional()
  @IsNumber()
  gte?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  contains?: string;

  @IsOptional()
  @IsString()
  equals?: string;

  @IsOptional()
  @IsString()
  startsWith?: string;

  @IsOptional()
  @IsString()
  endsWith?: string;

  @IsOptional()
  @IsString()
  notContains?: string;
}

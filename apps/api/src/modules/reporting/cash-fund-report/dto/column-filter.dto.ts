import { IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Per-column filter applied POST-aggregate on a row's value.
 * Numeric/date columns use eq/lt/lte/gt/gte/from/to; text columns use the
 * string operators. Present operators on one column are AND'd together.
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

  /** Text operators (string columns). */
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

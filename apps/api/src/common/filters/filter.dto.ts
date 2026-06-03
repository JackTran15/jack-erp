import { Allow, IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export enum StringOperator {
  CONTAINS     = '*',
  EQUALS       = '=',
  STARTS_WITH  = '+',
  ENDS_WITH    = '-',
  NOT_CONTAINS = '!',
}

export enum CompareOperator {
  EQUALS = '=',
  LT     = '<',
  LTE    = '<=',
  GT     = '>',
  GTE    = '>=',
}

export class StringFilterDto {
  @IsEnum(StringOperator)
  operator: StringOperator;

  @IsString()
  value: string;
}

export class CompareFilterDto {
  @IsEnum(CompareOperator)
  operator: CompareOperator;

  @Allow()
  value: string | number;
}

export class DateRangeFilterDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class EnumFilterDto {
  @Allow()
  value: string | null;
}

import { IsNumber, IsOptional, IsString } from 'class-validator';

/** Per-column filter applied POST-aggregate on a day's value (the "=" / "≤" widget row). */
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
}

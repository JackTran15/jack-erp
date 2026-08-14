import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional } from 'class-validator';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';

const OPERATORS = [
  ...Object.values(StringOperator),
  ...Object.values(CompareOperator),
] as string[];

/**
 * One column's filter as the grid sends it.
 *
 * Deliberately the same shape the v2 search endpoints already accept
 * (`ColumnFilter` on the web side), so the report grids reuse the filter row
 * they already have instead of growing a second vocabulary. Number columns use
 * numeric operators — the report grids used to match against the *formatted*
 * string client-side, which could only ever filter the page in view.
 */
export class ReportColumnFilterDto {
  @ApiPropertyOptional({
    description:
      'Toán tử: * chứa, = bằng, + bắt đầu, - kết thúc, ! không chứa (text); =, <, <=, >, >= (số)',
  })
  @IsOptional()
  @IsIn(OPERATORS)
  operator?: string;

  @ApiPropertyOptional({ description: 'Giá trị lọc đơn' })
  @IsOptional()
  @Allow()
  value?: string | number | null;

  @ApiPropertyOptional({ description: 'Cận dưới (cột số, chế độ khoảng)' })
  @IsOptional()
  @Allow()
  from?: string | number | null;

  @ApiPropertyOptional({ description: 'Cận trên (cột số, chế độ khoảng)' })
  @IsOptional()
  @Allow()
  to?: string | number | null;
}

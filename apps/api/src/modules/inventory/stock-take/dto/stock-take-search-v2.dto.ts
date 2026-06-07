import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search request for the Kiểm kê kho (stock-take) list.
 * Filterable columns mirror what `StockTakesPage` renders:
 * Ngày, Số phiếu KK, Kho kiểm kê, Diễn giải, Trạng thái.
 */
export class StockTakeSearchV2Dto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Số phiếu KK (document number) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Kho kiểm kê (storage name) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  storage?: StringFilterDto;

  /** Diễn giải (purpose free-text) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  purpose?: StringFilterDto;

  /** Trạng thái (status enum: DRAFT | POSTED | CANCELLED) */
  @ApiProperty({ required: false, type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Ngày (created date range) */
  @ApiProperty({ required: false, type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  date?: DateRangeFilterDto;
}

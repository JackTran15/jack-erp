import {
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search request for the Chuyển kho (stock transfer) list.
 * Filterable columns mirror what `StockTransferPage` renders:
 * Ngày, Số phiếu chuyển, Trạng thái, Vị trí xuất, Vị trí nhập, Diễn giải.
 */
export class StockTransferSearchV2Dto {
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

  /** Số phiếu chuyển (document number) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Trạng thái (status enum: DRAFT | APPROVED | POSTED | CANCELLED) */
  @ApiProperty({ required: false, type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Vị trí xuất (source location name) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  sourceLocation?: StringFilterDto;

  /** Vị trí nhập (destination location name) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  destinationLocation?: StringFilterDto;

  /** Diễn giải (notes) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  notes?: StringFilterDto;

  /** Ngày (created date range — header createdAt) */
  @ApiProperty({ required: false, type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  date?: DateRangeFilterDto;
}

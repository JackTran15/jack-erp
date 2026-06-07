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
 * Server-side search request for the Lệnh điều chuyển (transfer order) list.
 * Filterable columns mirror what `TransferOrdersPage` renders:
 * Ngày, Số chứng từ, Lý do, Điều chuyển đến, Trạng thái.
 */
export class TransferOrderSearchV2Dto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Số chứng từ (document number) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Trạng thái (status enum: DRAFT | APPROVED | EXECUTED | CANCELLED) */
  @ApiProperty({ required: false, type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Điều chuyển từ (source branch name) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  sourceBranch?: StringFilterDto;

  /** Điều chuyển đến (destination branch name) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  destinationBranch?: StringFilterDto;

  /** Lý do (notes) */
  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  notes?: StringFilterDto;

  /** Ngày (requested date, falling back to created date) */
  @ApiProperty({ required: false, type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  date?: DateRangeFilterDto;
}

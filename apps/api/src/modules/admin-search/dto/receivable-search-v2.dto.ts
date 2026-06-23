import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class ReceivableSearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  currency?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amount?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  settledAmount?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  dueDate?: DateRangeFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;
}

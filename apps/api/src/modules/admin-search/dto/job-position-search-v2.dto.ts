import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class JobPositionSearchV2Dto {
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

  /** Position name */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Position code */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Creation date range */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Active flag */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

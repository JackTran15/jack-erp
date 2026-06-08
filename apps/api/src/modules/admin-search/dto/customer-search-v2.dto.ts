import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class CustomerSearchV2Dto {
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

  /** Customer code */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Customer name */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Email */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  email?: StringFilterDto;

  /** Phone */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  phone?: StringFilterDto;

  /** Lifecycle status (ACTIVE / INACTIVE / MERGED) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Creation date range */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Exact branch filter (entity is organization-scoped; this is a filter, not a scope) */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

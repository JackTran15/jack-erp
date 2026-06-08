import {
  IsBoolean,
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

export class ProviderSearchV2Dto {
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

  /** Provider code */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Provider name */
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

  /** Tax code */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  taxCode?: StringFilterDto;

  /** Provider type (organization / individual) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  /** Creation date range */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Active flag */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Also-a-customer flag */
  @IsOptional()
  @IsBoolean()
  isCustomer?: boolean;

  /** Exact supplier-group filter */
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

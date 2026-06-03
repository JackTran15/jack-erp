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
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class EmployeeSearchV2Dto {
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

  /** Employee code (profile.code) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Full name — matched over CONCAT(firstName, ' ', lastName) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  fullName?: StringFilterDto;

  /** Email */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  email?: StringFilterDto;

  /** Creation date range */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Active (login) flag — the "status" column */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Exact job-position filter */
  @IsOptional()
  @IsUUID()
  jobPositionId?: string;
}

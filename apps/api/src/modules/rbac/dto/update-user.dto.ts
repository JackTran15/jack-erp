import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeeProfileDto } from './employee-profile.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** HR profile to upsert. Provided child collections fully replace the existing set. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeProfileDto)
  profile?: EmployeeProfileDto;
}

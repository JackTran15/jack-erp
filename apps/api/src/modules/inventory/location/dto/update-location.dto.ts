import { IsString, IsOptional, IsBoolean, IsEnum, MinLength, MaxLength } from 'class-validator';
import { LocationType } from '@erp/shared-interfaces';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

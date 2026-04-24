import { IsString, IsUUID, IsEnum, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { LocationType } from '@erp/shared-interfaces';

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsUUID()
  storageId: string;

  @IsUUID()
  branchId: string;

  @IsEnum(LocationType)
  type: LocationType;
}

import { IsString, IsUUID, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class CreateStorageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsBoolean()
  isMainStorage?: boolean;
}

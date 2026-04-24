import { IsString, IsUUID, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class CreateShowroomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsUUID()
  branchId: string;

  @IsUUID()
  storageId: string;

  @IsOptional()
  @IsBoolean()
  isMainShowroom?: boolean;
}

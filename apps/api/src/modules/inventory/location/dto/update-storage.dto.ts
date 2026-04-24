import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateStorageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}

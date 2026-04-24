import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentAccountId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { IsString, IsOptional, IsEmail, IsEnum, MinLength, MaxLength } from 'class-validator';
import { BranchStatus } from '@erp/shared-interfaces';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}

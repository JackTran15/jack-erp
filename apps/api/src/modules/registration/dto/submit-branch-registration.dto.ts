import { IsString, IsOptional, IsEmail, IsUUID, MinLength, MaxLength } from 'class-validator';

export class SubmitBranchRegistrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  branchName: string;

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
  @IsUUID()
  parentBranchId?: string;
}

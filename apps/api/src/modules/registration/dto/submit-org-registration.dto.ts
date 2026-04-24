import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';

export class SubmitOrgRegistrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  organizationName: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsEmail()
  ownerEmail: string;
}

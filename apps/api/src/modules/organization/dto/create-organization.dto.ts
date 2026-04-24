import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}

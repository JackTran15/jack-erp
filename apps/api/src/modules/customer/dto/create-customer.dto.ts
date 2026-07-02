import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUUID,
  IsDateString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '../customer.entity';
import { MembershipTier } from '../membership-card.entity';

export class CreateMembershipCardInlineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  cardNumber?: string;

  @IsOptional()
  @IsEnum(MembershipTier)
  tier?: MembershipTier;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  lomasCardNumber?: string;

  @IsOptional()
  @IsString()
  lomasTier?: string;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nationalId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  assignedStaffId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMembershipCardInlineDto)
  membershipCard?: CreateMembershipCardInlineDto;
}

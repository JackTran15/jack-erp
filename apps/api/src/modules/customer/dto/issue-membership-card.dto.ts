import { IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';
import { MembershipTier } from '../membership-card.entity';

export class IssueMembershipCardDto {
  @IsOptional() @IsEnum(MembershipTier) tier?: MembershipTier;
  @IsDateString() issuedAt: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() lomasCardNumber?: string;
  @IsOptional() @IsString() lomasTier?: string;
}

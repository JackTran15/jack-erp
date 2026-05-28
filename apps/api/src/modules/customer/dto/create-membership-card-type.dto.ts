import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipTier } from '../membership-card.entity';

export class CreateMembershipCardTypeDto {
  @ApiProperty({ example: 'Thẻ Bạc' })
  @IsString()
  name: string;

  @ApiProperty({ enum: MembershipTier })
  @IsEnum(MembershipTier)
  tier: MembershipTier;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

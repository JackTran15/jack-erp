import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { FeeBearer } from '@erp/shared-interfaces';

export class CreateDepositPaymentPolicyDto {
  @ApiProperty({ description: 'cash | bank_transfer | card' })
  @IsString()
  @MaxLength(50)
  paymentMethod: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  cardType?: string;

  @ApiPropertyOptional({ description: 'Fund override; only when the COA-join is ambiguous' })
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  feeRate?: number;

  @ApiPropertyOptional({ enum: FeeBearer })
  @IsOptional()
  @IsEnum(FeeBearer)
  feeBearer?: FeeBearer;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  settlementDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDepositPaymentPolicyDto extends PartialType(
  CreateDepositPaymentPolicyDto,
) {}

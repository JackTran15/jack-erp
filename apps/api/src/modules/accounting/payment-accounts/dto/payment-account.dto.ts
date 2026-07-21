import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentAccountMethod } from '../enums';

export class CreatePaymentAccountDto {
  @ApiProperty({ enum: PaymentAccountMethod })
  @IsEnum(PaymentAccountMethod)
  paymentMethod: PaymentAccountMethod;

  /** NULL/omitted = org-wide default; set = override for this branch only. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /**
   * COA account id (receiving account). Required for the cash method; for
   * non-cash methods it is derived server-side from `depositAccountId` and
   * any client-supplied value is overwritten.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** Required for non-cash methods — the exact deposit fund this mapping credits. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePaymentAccountDto extends PartialType(CreatePaymentAccountDto) {}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CashTransferFundKind,
  CashVoucherPartnerType,
} from '../../../cash-vouchers/enums';

export class CashTransferLineDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: 'cash_voucher_categories id (direction OUT)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/** Leg A (source) is always the caller's active branch — see ActorContext.branchId. */
export class CreateCashTransferDto {
  @ApiProperty({ description: 'Destination branch (B)' })
  @IsUUID()
  toBranchId: string;

  @ApiProperty({
    enum: CashTransferFundKind,
    description: "Where the money lands at branch B: its cash fund or a deposit account",
  })
  @IsEnum(CashTransferFundKind)
  toFundKind: CashTransferFundKind;

  @ApiPropertyOptional({
    description:
      'Destination deposit account — required when toFundKind is DEPOSIT, ignored otherwise. Must belong to toBranchId and be ACTIVE.',
  })
  @IsOptional()
  @IsUUID()
  toAccountId?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: "Source cash fund; defaults to the initiating branch's fund",
  })
  @IsOptional()
  @IsUUID()
  fromCashAccountId?: string;

  @ApiPropertyOptional({ description: 'Voucher date of leg A (defaults to today)' })
  @IsOptional()
  @IsISO8601()
  docDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CashVoucherPartnerType)
  partnerType?: CashVoucherPartnerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** "Người nhận" */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** Cashier who paid (thủ quỹ). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paidBy?: string;

  @ApiPropertyOptional({ type: [CashTransferLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashTransferLineDto)
  lines?: CashTransferLineDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { BankVoucherPartnerType } from '../../enums';

/** Leg A (source) is always the caller's active branch — see ActorContext.branchId. */
export class CreateDepositTransferDto {
  @ApiProperty({ description: 'Destination branch (B)' })
  @IsUUID()
  toBranchId: string;

  @ApiProperty({ description: 'Destination deposit account (must belong to toBranchId)' })
  @IsUUID()
  toAccountId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

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

  /** Cashier who paid (thủ quỹ). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paidBy?: string;
}

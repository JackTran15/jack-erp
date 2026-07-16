import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum FundSwapDirection {
  DEPOSIT_TO_CASH = 'DEPOSIT_TO_CASH',
  CASH_TO_DEPOSIT = 'CASH_TO_DEPOSIT',
}

/**
 * Move money between the cash fund and the deposit fund of the same branch
 * (FR-08), both legs in one ACID transaction (BR-SWP-01).
 */
export class CreateFundSwapDto {
  @IsEnum(FundSwapDirection)
  direction: FundSwapDirection;

  @IsUUID()
  depositAccountId: string;

  /** Defaults to the branch's single cash fund when omitted. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** "Ngày chứng từ" (YYYY-MM-DD). */
  @IsISO8601()
  docDate: string;

  /**
   * Withdrawal fee (BR-SWP-03) — only applies to DEPOSIT_TO_CASH. Posted as a
   * separate BANK_FEE bank_payment (its own expense entry); the cash leg still
   * receives the full `amount`.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  feeAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

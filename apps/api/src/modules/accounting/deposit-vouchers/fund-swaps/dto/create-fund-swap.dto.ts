import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { BankVoucherPartnerType } from '../../enums';

export enum FundSwapDirection {
  DEPOSIT_TO_CASH = 'DEPOSIT_TO_CASH',
  CASH_TO_DEPOSIT = 'CASH_TO_DEPOSIT',
}

/** One detail line, mirroring BankPaymentLineDto so the form round-trips. */
export class FundSwapLineDto {
  @IsString()
  @MaxLength(500)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** "Mục chi"/"Mục thu" — a cash_voucher_categories id. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;
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

  /**
   * DEPOSIT_TO_CASH only. False skips auto-creating the matching cash receipt —
   * only the deposit-withdrawal leg posts, parking the amount in TK 113 "Tiền
   * đang chuyển" until the cashier creates a separate cash receipt themselves
   * once the money is actually counted (matches MISA; no pending/confirm state
   * is tracked for this — unlike the GĐ4 inter-branch transfer). Omitted or
   * true keeps the current atomic 2-leg behavior.
   */
  @IsOptional()
  @IsBoolean()
  autoCreateReceipt?: boolean;

  // ---------------------------------------------------------------------------
  // Party / staff carried onto BOTH legs so the generated vouchers are not blank
  // (MISA parity). All optional — the standalone "Chuyển quỹ" dialog does not
  // collect them.
  // ---------------------------------------------------------------------------

  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** "Người nhận"/"Người nộp" — free text, independent of the partner record. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  /** Used only when the partner lookup yields no address of its own. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** "Nhân viên chi/thu" — a users.id. */
  @IsOptional()
  @IsUUID()
  paidBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  /**
   * Detail lines of the source leg. When omitted the service falls back to a
   * single synthesized line, which is the pre-existing behaviour.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FundSwapLineDto)
  lines?: FundSwapLineDto[];
}

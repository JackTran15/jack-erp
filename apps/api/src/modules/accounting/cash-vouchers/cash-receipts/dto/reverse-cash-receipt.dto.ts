import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReverseCashReceiptDto {
  /** Reason for the reversal (đảo bút). Stored on the reversal voucher. */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

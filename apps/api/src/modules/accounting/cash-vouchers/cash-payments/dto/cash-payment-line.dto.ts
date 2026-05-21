import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A single cash payment line. On PATCH upsert: `id` present → update existing
 * line; `id` absent → insert; existing lines whose id is missing are deleted.
 * `line_order` is assigned server-side from the array index.
 */
export class CashPaymentLineDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  /** "Diễn giải" */
  @IsString()
  @MaxLength(500)
  description: string;

  /** "Mục chi" — references a cash_voucher_categories row. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referenceNote?: string;
}

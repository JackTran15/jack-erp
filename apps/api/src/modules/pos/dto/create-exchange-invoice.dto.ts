import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInvoiceItemDto } from './create-invoice.dto';
import { ReturnInvoiceLineDto } from './create-return-invoice.dto';

export class CreateExchangeInvoiceDto {
  @IsString()
  sessionId: string;

  /**
   * The original SALE invoice being exchanged against. Omit it for a QUICK
   * exchange (the POS "đổi trả nhanh" flow), which has no original document:
   * return lines are then free-form, skip the eligibility check, and take their
   * cost basis from the item's current purchase price. Its presence — not a
   * separate `mode` field — is what selects the mode.
   */
  @IsOptional()
  @IsUUID()
  originalInvoiceId?: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Items being returned (direction=IN). Each must reference an original SALE
   * line via `originalInvoiceItemId` when `originalInvoiceId` is set; in QUICK
   * mode that field must be absent on every line.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnInvoiceLineDto)
  returnLines: ReturnInvoiceLineDto[];

  /** New items being purchased (direction=OUT). Same shape as a normal SALE. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  newLines: CreateInvoiceItemDto[];
}

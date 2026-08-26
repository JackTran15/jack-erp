import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LineDiscountType } from '../entities/invoice-item.entity';

export enum ReturnInvoiceMode {
  QUICK = 'quick',
  REGULAR = 'regular',
}

export class ReturnInvoiceLineDto {
  /** Required in REGULAR mode — points back to the original SALE invoice_item. */
  @IsOptional()
  @IsUUID()
  originalInvoiceItemId?: string;

  @IsUUID()
  itemId: string;

  @IsString()
  itemCode: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  /** Server-computed discount amount; ignored when lineDiscountType is set. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscount?: number;

  /** Manual per-line discount type; when set, the server computes lineDiscount from lineDiscountValue. */
  @IsOptional()
  @IsEnum(LineDiscountType)
  lineDiscountType?: LineDiscountType;

  /** Raw discount value: 10 means 10% when type=percent; a currency amount when type=amount. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscountValue?: number;

  /** Free-text reason/label for the discount, e.g. "sale30". */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lineDiscountReason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateReturnInvoiceDto {
  @IsEnum(ReturnInvoiceMode)
  mode: ReturnInvoiceMode;

  /** Required when mode = REGULAR. */
  @IsOptional()
  @IsUUID()
  originalInvoiceId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  sessionId: string;

  @IsString()
  reason: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnInvoiceLineDto)
  lines: ReturnInvoiceLineDto[];
}

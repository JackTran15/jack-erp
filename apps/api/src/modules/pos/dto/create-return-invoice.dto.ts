import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscount?: number;

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

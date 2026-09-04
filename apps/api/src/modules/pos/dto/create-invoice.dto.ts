import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  IsEnum,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LineDiscountType } from '../entities/invoice-item.entity';

export class CreateInvoiceItemDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsString()
  itemCode: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  /** Server-computed discount amount; ignored when lineDiscountType is set. */
  @IsNumber()
  @Min(0)
  @IsOptional()
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

  /** Free-text reason/label for the discount, e.g. "cc". */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lineDiscountReason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  sortOrder?: number;
}

export class CreateInvoiceDto {
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  draftLabel?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];

  /** Employee (employee_profiles.id) credited with the sale. */
  @IsOptional()
  @IsUUID()
  salespersonId?: string;
}

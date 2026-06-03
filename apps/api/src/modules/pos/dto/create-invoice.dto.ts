import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  lineDiscount?: number;

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

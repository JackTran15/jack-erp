import { IsOptional, IsString, IsUUID, IsArray, ValidateNested, IsNumber, IsEnum, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { LineDiscountType } from '../entities/invoice-item.entity';

export class UpdateInvoiceItemDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsString() itemCode: string;
  @IsString() itemName: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) lineDiscount?: number;
  @IsOptional() @IsEnum(LineDiscountType) lineDiscountType?: LineDiscountType;
  @IsOptional() @IsNumber() @Min(0) lineDiscountValue?: number;
  @IsOptional() @IsString() @MaxLength(255) lineDiscountReason?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() sortOrder?: number;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() draftLabel?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateInvoiceItemDto) items?: UpdateInvoiceItemDto[];
  /** Employee (employee_profiles.id) credited with the sale. */
  @IsOptional() @IsUUID() salespersonId?: string;
}

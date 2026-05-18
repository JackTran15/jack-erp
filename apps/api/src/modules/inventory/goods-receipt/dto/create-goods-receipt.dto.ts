import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
} from '@erp/shared-interfaces';

export type CashMethod = 'CASH' | 'BANK' | 'EWALLET';

export class GoodsReceiptLineDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsUUID()
  binId?: string;

  @IsString()
  @MaxLength(50)
  uomCode: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CashSettlementDto {
  @IsEnum(['CASH', 'BANK', 'EWALLET'])
  method: CashMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateGoodsReceiptDto {
  @IsEnum(GoodsReceiptPurpose)
  purpose: GoodsReceiptPurpose;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveredBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsEnum(GoodsReceiptReferenceType)
  referenceType?: GoodsReceiptReferenceType;

  /** Source branch for transfer-in. Stored separately from referenceId. */
  @IsOptional()
  @IsString()
  sourceBranchId?: string;

  @IsISO8601()
  receivedAt: string;

  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashPayment?: CashSettlementDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashReceipt?: CashSettlementDto;
}

import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
} from '@erp/shared-interfaces';
import {
  CashSettlementDto,
  GoodsReceiptLineDto,
} from './create-goods-receipt.dto';

export class UpdateGoodsReceiptDto {
  @IsOptional()
  @IsEnum(GoodsReceiptPurpose)
  purpose?: GoodsReceiptPurpose;

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

  @IsOptional()
  @IsString()
  sourceBranchId?: string;

  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines?: GoodsReceiptLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashPayment?: CashSettlementDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashReceipt?: CashSettlementDto;
}

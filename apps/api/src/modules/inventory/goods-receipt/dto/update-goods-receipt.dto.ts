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
  DocCounterpartyKind,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
} from '@erp/shared-interfaces';
import {
  CashSettlementDto,
  GoodsReceiptLineDto,
} from './create-goods-receipt.dto';
import { GoodsReceiptPaymentMethod } from '../goods-receipt.entity';

export class UpdateGoodsReceiptDto {
  @IsOptional()
  @IsEnum(GoodsReceiptPurpose)
  purpose?: GoodsReceiptPurpose;

  /**
   * Accepted so the edit form can round-trip the value it loaded — the global
   * `forbidNonWhitelisted` pipe rejects the whole request otherwise. Changing it
   * is refused by the service: it would change what the receipt owes and to whom.
   */
  @IsOptional()
  @IsEnum(GoodsReceiptPaymentMethod)
  paymentMethod?: GoodsReceiptPaymentMethod;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveredBy?: string;

  /** Nhân viên mua hàng — user (users.id) responsible for the purchase. */
  @IsOptional()
  @IsUUID()
  purchasingEmployeeId?: string;

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

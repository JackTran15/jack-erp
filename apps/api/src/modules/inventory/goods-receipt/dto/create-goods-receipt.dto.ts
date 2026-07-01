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
} from "class-validator";
import { Type } from "class-transformer";
import {
  DocCounterpartyKind,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
} from "@erp/shared-interfaces";
import { GoodsReceiptPaymentMethod } from "../goods-receipt.entity";

export type CashMethod = "CASH" | "BANK" | "EWALLET";

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
  @IsEnum(["CASH", "BANK", "EWALLET"])
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

  /** Đối tượng kind (supplier | customer | employee). When set, the service
   *  validates the counterparty and routes supplier→provider_id, customer /
   *  employee→counterparty cols (provider_id null). */
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
  @IsUUID("all", { each: true })
  attachmentIds?: string[];

  /** FE-supplied reference codes shown as Tham chiếu. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];

  /** Settlement on post: CASH posts a cash movement + auto Phiếu chi; CREDIT posts a payable JE. */
  @IsOptional()
  @IsEnum(GoodsReceiptPaymentMethod)
  paymentMethod?: GoodsReceiptPaymentMethod;

  /** Cash account to pay from; defaults to the branch cash fund when omitted. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashPayment?: CashSettlementDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CashSettlementDto)
  cashReceipt?: CashSettlementDto;
}

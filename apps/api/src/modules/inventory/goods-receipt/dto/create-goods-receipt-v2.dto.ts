import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  DocCounterpartyKind,
  GoodsReceiptPurpose,
} from "@erp/shared-interfaces";
import { GoodsReceiptPaymentMethod } from "../goods-receipt.entity";
import { GoodsReceiptLineDto } from "./create-goods-receipt.dto";

/**
 * v2 goods-receipt creation. Adds the supplier/customer "Đối tượng" and relies
 * on the client having resolved each line's location (via resolve-locations),
 * then enforces the per-product uniform-location rule server-side.
 */
export class CreateGoodsReceiptV2Dto {
  @IsOptional()
  @IsEnum(GoodsReceiptPurpose)
  purpose?: GoodsReceiptPurpose;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @IsUUID()
  counterpartyId?: string;

  @IsISO8601()
  receivedAt: string;

  /** Header location; derived from the first line when omitted. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

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
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsEnum(GoodsReceiptPaymentMethod)
  paymentMethod?: GoodsReceiptPaymentMethod;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];
}

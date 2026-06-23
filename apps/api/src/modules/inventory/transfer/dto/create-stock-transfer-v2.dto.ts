import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocCounterpartyKind } from '@erp/shared-interfaces';

export class StockTransferV2LineDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  /** Kho xuất — source storage for this line (branch-scoped path). */
  @IsUUID()
  sourceStorageId: string;

  /** Kho nhập — destination storage for this line. */
  @IsUUID()
  destinationStorageId: string;

  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * v2 branch-scoped (Kho → Kho) transfer input. Header source/destination
 * locations + branch are derived by the service from each line's storages, so
 * the client only sends per-line Kho xuất/Kho nhập + metadata. The handler
 * enforces the per-product uniform source-location rule before posting.
 */
export class CreateStockTransferV2Dto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  transporterUserId?: string;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ValidateIf((o) => o.counterpartyKind !== undefined)
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsISO8601()
  transferredAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferV2LineDto)
  lines: StockTransferV2LineDto[];
}

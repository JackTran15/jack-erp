import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocCounterpartyKind, GoodsIssuePurpose } from '@erp/shared-interfaces';

export class GoodsIssueV2LineDto {
  @IsUUID()
  itemId: string;

  /** Per-line bin; falls back to header locationId when omitted. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * v2 goods-issue creation. Adds the supplier/customer "Đối tượng" and enforces
 * the per-product uniform-location rule; the DRAFT itself is built by the proven
 * GoodsIssueService.create (reason/purpose resolution kept intact).
 */
export class CreateGoodsIssueV2Dto {
  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ValidateIf((o) => o.counterpartyKind !== undefined)
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsEnum(GoodsIssuePurpose)
  purpose?: GoodsIssuePurpose;

  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @IsUUID()
  targetBranchId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  deliverer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsIssueV2LineDto)
  lines: GoodsIssueV2LineDto[];
}

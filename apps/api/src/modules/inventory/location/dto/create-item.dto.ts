import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

export class CreateItemBarcodeInput {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateItemProviderInput {
  @IsUUID()
  providerId: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateItemUnitInput {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unitName: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ratio?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellPrice?: number;

  @IsOptional()
  @IsBoolean()
  isDefaultSell?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultBuy?: boolean;
}

export class CreateItemThresholdInput {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQty?: number;
}

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPosVisible?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightGram?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  manufactureYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  composition?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  // ─── Phase 2 primitives ─────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageWeightGram?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageLengthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageWidthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageHeightCm?: number;

  @IsOptional()
  @IsBoolean()
  isGoldSilver?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  oddSize?: string;

  @IsOptional()
  @IsBoolean()
  manageBarcodePerUnit?: boolean;

  // ─── Single-provider convenience (will be upserted as primary) ──────
  @IsOptional()
  @IsUUID()
  providerId?: string;

  // ─── Nested arrays ──────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateItemBarcodeInput)
  barcodes?: CreateItemBarcodeInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateItemProviderInput)
  providers?: CreateItemProviderInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateItemUnitInput)
  units?: CreateItemUnitInput[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateItemThresholdInput)
  threshold?: CreateItemThresholdInput;

  // ─── Opening balance / initial stock ────────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStockUnitPrice?: number;

  @IsOptional()
  @IsUUID()
  initialLocationId?: string;
}

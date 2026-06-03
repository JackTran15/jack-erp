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
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { CreateItemProviderInput, CreateItemUnitInput } from './create-item.dto';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit?: string;

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

  // ─── Brand (denormalized name kept in sync with brandId) ─────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  // ─── Phase 2 primitives (now editable) ──────────────────────────────
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

  // ─── Nested arrays (reconciled on update) ───────────────────────────
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
}

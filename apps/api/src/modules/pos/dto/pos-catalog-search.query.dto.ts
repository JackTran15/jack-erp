import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum PosCatalogSearchMode {
  /** Exact SKU/barcode arm only — the barcode scan and the Enter key. */
  EXACT = 'exact',
  /** Exact arm plus the fuzzy suggestion arm — the debounced typing path. */
  FULL = 'full',
}

export enum PosCatalogSearchView {
  /** Full PosCatalogLine, including locations[] and quantityOnHand. */
  FULL = 'full',
  /** Trimmed rows for a suggestion dropdown; see PosCatalogSuggestionDto. */
  SUGGEST = 'suggest',
}

/** Default row cap when the caller does not ask for one. */
export const POS_CATALOG_SEARCH_DEFAULT_LIMIT = 20;

/**
 * Hard ceiling on the row cap. Applied by clamping rather than by rejecting:
 * the only client is ours, and a suggestion dropdown that 400s because a number
 * was mistyped is worse than one that quietly returns 100 rows.
 */
export const POS_CATALOG_SEARCH_MAX_LIMIT = 100;

export class PosCatalogSearchQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  q: string;

  @IsOptional()
  @IsEnum(PosCatalogSearchMode)
  mode?: PosCatalogSearchMode;

  @IsOptional()
  @IsEnum(PosCatalogSearchView)
  view?: PosCatalogSearchView;

  /**
   * No @Max here on purpose — the ceiling is clamped in the handler so an
   * oversized value succeeds instead of failing validation.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Include stock at stop-tracked (is_tracked=false) details. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeUntracked?: boolean;
}

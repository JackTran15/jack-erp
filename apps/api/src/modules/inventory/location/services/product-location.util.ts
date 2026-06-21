import { UnprocessableEntityException } from '@nestjs/common';

export interface ProductLocationLine {
  itemId: string;
  productId?: string | null;
  locationId: string;
}

/**
 * Enforce "all variants of one product sit in a single location": within a
 * single document, every line sharing a productId must target the same
 * locationId. Lines without a productId (orphan items) are unconstrained.
 *
 * Pure function so both ProductLocationService and the document command handlers
 * share one implementation.
 */
export function assertProductUniformLocation(lines: ProductLocationLine[]): void {
  const byProduct = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.productId) continue;
    const set = byProduct.get(line.productId) ?? new Set<string>();
    set.add(line.locationId);
    byProduct.set(line.productId, set);
  }
  for (const [productId, locations] of byProduct) {
    if (locations.size > 1) {
      throw new UnprocessableEntityException(
        `All variants of product ${productId} must share a single location (found ${locations.size})`,
      );
    }
  }
}

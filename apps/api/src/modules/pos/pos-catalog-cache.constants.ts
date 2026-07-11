/**
 * Redis cache coordinates for the POS product-level catalog skeleton
 * (see PosCatalogProductService.buildOrgCards). Kept in a standalone module so
 * inventory write paths can invalidate the same entry without importing the
 * POS service.
 */
export const CATALOG_CACHE_NAMESPACE = 'pos-catalog';
export const CATALOG_CACHE_TTL_SECONDS = 60;
export const catalogCardsKey = (orgId: string): string => `cards:${orgId}`;

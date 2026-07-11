import type { LocationType } from './index';

export enum StockStateFilter {
  ALL = 'all',
  POSITIVE = 'positive',
  ZERO = 'zero',
  NEGATIVE = 'negative',
  BELOW_MIN = 'below-min',
}

export interface StockByLocationProvider {
  providerId: string;
  providerName: string;
  isPrimary: boolean;
}

export interface StockByLocationItem {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  productId: string | null;
  variantLabel: string | null;
  isPosVisible: boolean;
  isActive: boolean;
  isTracked: boolean;
  sellingPrice: number;
  purchasePrice: number;
  barcodes: string[];
  providers: StockByLocationProvider[];
  quantity: number;
  minQty: number | null;
  maxQty: number | null;
  belowMin: boolean;
  lastMovementAt: string | null;
}

export interface StockByLocationStorageRef {
  id: string;
  name: string;
}

export interface StockByLocationBranchRef {
  id: string;
  name: string;
}

export interface StockByLocationLocationRef {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
  storage: StockByLocationStorageRef;
  branch: StockByLocationBranchRef;
}

export interface StockByLocationMeta {
  location: StockByLocationLocationRef;
  total: number;
  page: number;
  pageSize: number;
}

export interface StockByLocationResponse {
  data: StockByLocationItem[];
  meta: StockByLocationMeta;
}

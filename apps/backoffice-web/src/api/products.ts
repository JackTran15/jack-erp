import { apiClient } from "../lib/api-axios";

export interface Product {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  defaultProviderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttributeOption {
  id: string;
  valueLabel: string;
  codeSuffix: string;
  sortOrder: number;
}

export interface AttributeDefinition {
  id: string;
  name: string;
  sortOrder: number;
  options: AttributeOption[];
}

export interface Variant {
  id: string;
  code: string;
  name?: string;
  variantLabel: string;
  productId: string;
  productName?: string;
  barcode?: string;
  unit?: string;
  attributes?: Record<string, string>;
}

export interface StockBalance {
  itemId: string;
  productId?: string;
  productName?: string;
  variantLabel?: string;
  locationId: string;
  quantity: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const productsApi = {
  list: (params?: Record<string, unknown>) =>
    apiClient.get<PaginatedResponse<Product>>("/products", { params }),

  getById: (id: string) => apiClient.get<Product>(`/products/${id}`),

  create: (data: Partial<Product>) =>
    apiClient.post<Product>("/products", data),

  update: (id: string, data: Partial<Product>) =>
    apiClient.patch<Product>(`/products/${id}`, data),

  delete: (id: string) => apiClient.delete(`/products/${id}`),

  listAttributes: (productId: string) =>
    apiClient.get<AttributeDefinition[]>(`/products/${productId}/attributes`),

  createAttribute: (productId: string, data: Partial<AttributeDefinition>) =>
    apiClient.post<AttributeDefinition>(
      `/products/${productId}/attributes`,
      data,
    ),

  updateAttribute: (
    productId: string,
    id: string,
    data: Partial<AttributeDefinition>,
  ) =>
    apiClient.patch<AttributeDefinition>(
      `/products/${productId}/attributes/${id}`,
      data,
    ),

  deleteAttribute: (productId: string, id: string) =>
    apiClient.delete(`/products/${productId}/attributes/${id}`),

  createOption: (
    productId: string,
    attrId: string,
    data: Partial<AttributeOption>,
  ) =>
    apiClient.post<AttributeOption>(
      `/products/${productId}/attributes/${attrId}/options`,
      data,
    ),

  updateOption: (
    productId: string,
    attrId: string,
    optId: string,
    data: Partial<AttributeOption>,
  ) =>
    apiClient.patch<AttributeOption>(
      `/products/${productId}/attributes/${attrId}/options/${optId}`,
      data,
    ),

  deleteOption: (productId: string, attrId: string, optId: string) =>
    apiClient.delete(
      `/products/${productId}/attributes/${attrId}/options/${optId}`,
    ),

  generateVariants: (productId: string, force?: boolean) =>
    apiClient.post<{ created: number }>(
      `/products/${productId}/generate-variants`,
      {
        force,
      },
    ),

  listItems: (productId: string, params?: Record<string, unknown>) =>
    apiClient.get<PaginatedResponse<Variant>>("/inventory/items", {
      params: { ...params, productId },
    }),

  listStockBalances: (productId: string, params?: Record<string, unknown>) =>
    apiClient.get<PaginatedResponse<StockBalance>>(
      "/inventory/stock/balances",
      {
        params: { ...params, productId },
      },
    ),
};

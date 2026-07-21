import { apiClient } from "../lib/api-axios";

// Kết quả tra cứu hàng hoá theo mã (khớp SKU hoặc mã vạch). Khớp đúng shape
// ItemLookupResultDto trả về từ GET /inventory/items/lookup, là superset của item
// mà ProductSelectDialog cần (sku = code).
export interface ItemLookupResult {
  itemId: string;
  productId: string | null;
  code: string;
  name: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  variantLabel: string | null;
  categoryName: string | null;
}

// Dùng raw axios (không phải erpApi typed) nên không cần regen @erp/api-client;
// chạy `pnpm openapi:generate` sau để đồng bộ typed client. API trả thẳng mảng
// (không có interceptor bọc {data}) nên đọc `res.data` trực tiếp.
export async function lookupItemByCode(code: string): Promise<ItemLookupResult[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const { data } = await apiClient.get<ItemLookupResult[]>(
    `/inventory/items/lookup?code=${encodeURIComponent(trimmed)}`,
  );
  return data;
}

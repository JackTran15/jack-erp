/**
 * Mẫu mã / hàng hóa giả lập cho các dropdown của modal row 3.
 *
 * Nhóm hàng hóa lấy từ API THẬT (`useItemCategoryTree`); mẫu mã và hàng hóa
 * chưa có endpoint options phù hợp nên tạm mock, sinh theo nhóm đang chọn.
 */
import { createRandom, hashSeed, randomInt } from "./seededRandom";

export interface CatalogOption {
  value: string;
  label: string;
  /** Mã SKU — dùng khi "Hiển thị" = Mã SKU. */
  sku: string;
}

const MODEL_PREFIXES = ["TNTY", "THUS", "CTH", "ABA", "TXV", "TXXW", "TN"];

/** Mẫu mã thuộc một nhóm hàng hóa. `categoryKey` rỗng = tất cả nhóm. */
export function mockVariants(categoryKey: string): CatalogOption[] {
  const random = createRandom(hashSeed("variants", categoryKey));
  const count = randomInt(random, 4, 8);

  return Array.from({ length: count }, (_, i) => {
    const prefix = MODEL_PREFIXES[randomInt(random, 0, MODEL_PREFIXES.length - 1)]!;
    const sku = `${prefix}${randomInt(random, 1000, 9999)}`;
    return { value: `${categoryKey}:variant:${i}`, label: `Mẫu ${sku}`, sku };
  });
}

/** Hàng hóa thuộc một mẫu mã (hoặc cả nhóm khi chưa chọn mẫu mã). */
export function mockProducts(scopeKey: string): CatalogOption[] {
  const random = createRandom(hashSeed("products", scopeKey));
  const count = randomInt(random, 6, 12);

  return Array.from({ length: count }, (_, i) => {
    const prefix = MODEL_PREFIXES[randomInt(random, 0, MODEL_PREFIXES.length - 1)]!;
    const sku = `${prefix}${randomInt(random, 1000, 9999)}-${randomInt(random, 10, 99)}`;
    return { value: `${scopeKey}:product:${i}`, label: sku, sku };
  });
}

export const UNITS = ["Đôi", "Cái", "Bộ", "Chiếc"] as const;

import type { BarcodePrefillItem } from "./barcode-print-navigation";

/**
 * Gộp các dòng tem trùng nhau khi in tem cho nhiều phiếu một lượt.
 *
 * Khóa gộp gồm cả kho và vị trí, không phải mỗi `itemId`: cùng một mặt hàng nằm ở
 * hai vị trí kho là hai tem khác nhau về nội dung, gộp lại là in sai.
 *
 * Chỉ dùng ở phía nguồn (các trang danh sách chứng từ). Trang "In tem mã" cố ý
 * không gộp — nó còn nhận hàng từ Chi tiết vị trí, Hàng hóa và từ người dùng gõ
 * tay, nơi hai dòng cùng SKU có thể là cố ý.
 */
export function mergeBarcodePrefillItems(
  items: BarcodePrefillItem[],
): BarcodePrefillItem[] {
  const byKey = new Map<string, BarcodePrefillItem>();

  for (const item of items) {
    const key = `${item.itemId}|${item.storageId ?? ""}|${item.locationId ?? ""}`;
    const existing = byKey.get(key);
    const quantity = Number(item.quantity) || 0;
    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + quantity;
    } else {
      // Bản sao nông: không mutate mảng đầu vào của người gọi.
      byKey.set(key, { ...item, quantity });
    }
  }

  // Map giữ thứ tự chèn — tem ra theo đúng thứ tự người dùng tick phiếu.
  return [...byKey.values()];
}

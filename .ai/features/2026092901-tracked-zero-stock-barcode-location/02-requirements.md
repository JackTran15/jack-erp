---
feature: tracked-zero-stock-barcode-location
stories: 1
acceptance_criteria: 3
---

# Requirements — vị trí đang theo dõi tồn <= 0 vẫn được gợi ý

## US-01 — Gợi ý Kho/Vị trí cho vị trí đang theo dõi bất kể số lượng

- **AC-01** — *Given* item không có kệ ưu tiên, chỉ có một `stock_balances` `is_tracked = true`, `quantity <= 0` ở vị trí active trong kho nhập mặc định, *When* `POST /v2/inventory/items/resolve-locations`, *Then* trả `locationId` của vị trí đó với `source: 'stock'` (spec `resolve-item-locations.handler.spec.ts`).
- **AC-02** — *Given* nhiều vị trí đang theo dõi, *Then* chọn vị trí tồn lớn nhất; hoà thì theo `loc.code ASC`. Vị trí `is_tracked = false` hoặc location không active vẫn bị loại (spec).
- **AC-03** — *Given* trang In tem mã và hàng hoá của AC-01, *When* thêm hàng vào bảng, *Then* Kho/Vị trí tự điền vị trí đó **[UI]** (Not verified here nếu thiếu dữ liệu local).

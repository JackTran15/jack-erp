---
feature: tracked-zero-stock-barcode-location
adr_count: 1
---

# Logical design — vị trí đang theo dõi tồn <= 0 vẫn được gợi ý

## Approach

`apps/api/src/modules/inventory/location/queries/resolve-item-locations.handler.ts`, bước (b):
bỏ `.andWhere('sb.quantity > 0')`, giữ `sb.is_tracked = true` và `loc.is_active = true`,
`orderBy('sb.quantity', 'DESC').addOrderBy('loc.code', 'ASC')`. Trang In tem mã đã điền
Kho/Vị trí khi `source === 'stock'`, nên không cần sửa frontend.

## Alternatives rejected

| Option | Why not |
|---|---|
| Cờ opt-in `includeNonPositive` chỉ cho In tem mã | Thêm field DTO + regen api-client; Akenzy chọn áp cho tất cả (A-01) |
| Frontend fallback sang `/inventory/stock/balances` khi `source` là default | Hai nguồn sự thật cho cùng một gợi ý; logic ưu tiên bị lặp |

## Contracts

Không đổi shape. Ngữ nghĩa `source: 'stock'` mở rộng: "vị trí đang theo dõi có tồn lớn nhất (kể cả <= 0)".

## Error taxonomy

Không có lỗi mới. Không tìm được bin đang theo dõi → rơi xuống (c) như cũ.

## ADRs

### ADR-01 — `is_tracked` là điều kiện đủ ở bước (b), không phải số lượng
**Status:** accepted
Theo dõi là quyết định nghiệp vụ của người dùng; số lượng âm/0 là trạng thái tạm thời của tồn. Gợi ý vị trí theo cờ theo dõi, số lượng chỉ để xếp hạng.

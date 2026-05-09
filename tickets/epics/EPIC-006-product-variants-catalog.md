# EPIC-006 Product variants & catalog (inventory)

## Summary

Tách **Product** (mặt hàng nhóm) khỏi **Item** (biến thể/SKU); thuộc tính **definition + option + junction**; tồn/chứng từ giữ **`itemId`**. Ràng buộc: trong **một kho (storage)**, một **product** chỉ **một vị trí**; nhiều product có thể chung vị trí.

Plan kỹ thuật chi tiết: xem bản plan product variants trong Cursor plans (`entity_product_variants_*.plan.md`) hoặc mô tả trong các ticket TKT-027+.

## Dependencies (epic-level)

- Hoàn thành [EPIC-003 Inventory and CSV](./EPIC-003-inventory-and-csv.md) (đặc biệt location hierarchy, ledger, item CRUD hiện có).

## Tickets trong epic

| Ticket | Mô tả ngắn |
|--------|------------|
| [TKT-027](../tickets/TKT-027-inventory-product-schema.md) | Migration + entities |
| [TKT-028](../tickets/TKT-028-product-crud-api.md) | Product CRUD API |
| [TKT-029](../tickets/TKT-029-product-attribute-api.md) | Attribute definitions & options |
| [TKT-030](../tickets/TKT-030-variant-generation-service.md) | Sinh / resolve biến thể |
| [TKT-031](../tickets/TKT-031-item-product-link-and-label.md) | Item: productId, variant_label |
| [TKT-032](../tickets/TKT-032-product-storage-location-rules.md) | 1 product / 1 vị trí / kho |
| [TKT-033](../tickets/TKT-033-stock-balance-variant-display.md) | API/UI join nhãn biến thể |
| [TKT-034](../tickets/TKT-034-pos-variant-validation.md) | POS checkout validate |
| [TKT-035](../tickets/TKT-035-backoffice-product-matrix-ui.md) | Backoffice product & ma trận |
| [TKT-036](../tickets/TKT-036-legacy-items-migration.md) | Migrate item legacy |
| [TKT-037](../tickets/TKT-037-product-variants-test-plan.md) | Tests & gate DoD |

## Graph phụ thuộc ticket

Xem [TKT-DEP-006-dependencies.md](../TKT-DEP-006-dependencies.md).

## Epic acceptance criteria

- [ ] Tạo được product + thuộc tính + biến thể; tồn gắn **itemId** đúng rule.
- [ ] POS chỉ bán biến thể có **productId** khi chọn từ catalog (legacy **không** product vẫn bán được nếu migrate cho phép).
- [ ] Trong một storage: không tồn tại hai location khác nhau cho cùng product (khi có `product_id`).
- [ ] Báo cáo/tồn hiển thị **tên product + nhãn biến thể**.

## Epic Definition of Done

- [ ] Mọi ticket TKT-027–037 đạt DoD riêng.
- [ ] Staging chạy migration + smoke POS + nhập kho mẫu.
- [ ] Không regression CRITICAL trên luồng tồn hiện có (transfer, adjustment, PO nhận).


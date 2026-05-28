# Inventory Import Field Mapping (Final)

**Phạm vi:** `apps/api/src/modules/inventory/csv`  
**Cập nhật:** 2026-05-28

## Mục tiêu hiện tại

- Dùng 1 template workbook dùng chung toàn hệ thống (không per-org).
- Import runtime chỉ đọc sheet `Danh sách hàng hóa`.
- Workbook xuất mẫu gồm 3 sheet: `Danh sách hàng hóa`, `Hướng dẫn nhập`, `Mô tả các trường nhập`.

## Trạng thái triển khai

### Đã triển khai

- Validate/import theo job, commit theo `duplicateMode` (`UPDATE`/`SKIP`).
- Hủy job khi quay lại bước chọn file.
- Export lỗi dạng `.xlsx` có cột `Tình trạng`.
- Refactor workbook theo cấu trúc `import-workbook/sheets/{data,guide,field}`.
- Bỏ flow template sheet theo org (DB + API upload/download).
- Template phụ chuyển sang static trong code: `import-workbook/inventory-import-template-static.ts`.

### Còn lại (ngoài MVP)

- P3: opening stock, unit convert đầy đủ, thresholds, `Description`.
- P4: thuế, ảnh, lô/serial, vị trí, bảng giá.

### Next steps

1. Chốt nội dung cuối cho `STATIC_GUIDE_GRID` và `STATIC_FIELD_GRID` (bản gọn hoặc full chuẩn nội bộ).
2. Tăng golden tests cho guide/field (merge, màu, border).
3. Mở ticket P2 theo scope nhỏ để mở rộng an toàn.

## Mapping 43 fields

**Chú thích:**
- `MAP`: đã map vào nghiệp vụ hiện tại.
- `DEFER`: chưa map trong MVP (để phase sau).

| # | Excel Key | Nhãn | Trạng thái | Đích hiện tại / Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | `SKUCode` | Mã SKU | MAP | `items.code` (bắt buộc) |
| 2 | `Barcode` | Mã vạch | MAP | `item_barcodes` |
| 3 | `ModelCode` | Mã SKU mẫu mã | MAP | `products.code` (lookup by code trước, fallback tạo mới với ModelName) |
| 4 | `ModelName` | Tên mẫu mã | MAP | `products.name` (upsert theo tên hoặc theo ModelCode) |
| 5 | `InventoryItemName` | Tên hàng hóa | MAP | `items.name` (bắt buộc) |
| 6 | `ItemCategoryCode` | Mã nhóm hàng hóa | MAP | `inventory_item_categories.code` (lookup by code, fallback tạo mới) |
| 7 | `ItemCategoryName` | Tên nhóm hàng hóa | MAP | resolve/create category theo tên |
| 8 | `BrandName` | Tên thương hiệu | MAP | `items.brand` |
| 9 | `UnitName` | ĐVT | MAP | `items.unit` |
| 10 | `Color` | Màu | MAP | `item_attribute_values` via `product_attribute_definitions(name=Color)` + options (yêu cầu productId) |
| 11 | `Size` | Size | MAP | `item_attribute_values` via `product_attribute_definitions(name=Size)` + options (yêu cầu productId) |
| 12 | `CostPrice` | Giá mua | MAP | `items.purchasePrice` |
| 13 | `UnitPrice` | Giá bán | MAP | `items.sellingPrice` |
| 14 | `TaxRate` | Thuế suất | DEFER | P4 |
| 15 | `OpeningQuantity` | SL tồn đầu | DEFER | P3 |
| 16 | `OpeningAmount` | Giá trị tồn đầu | DEFER | P3 |
| 17 | `OpeningStockName` | Kho tồn | DEFER | P3 |
| 18 | `MinimumStock` | SL tồn tối thiểu | DEFER | P3 |
| 19 | `MaximumStock` | SL tồn tối đa | DEFER | P3 |
| 20 | `UnitConvertName` | Đơn vị chuyển đổi | DEFER | P3 |
| 21 | `UnitConvertRate` | Tỷ lệ quy đổi | DEFER | P3 |
| 22 | `UnitConvertCostPrice` | Giá mua theo ĐVT CĐ | DEFER | P3 |
| 23 | `UnitConvertSalePrice` | Giá bán theo ĐVT CĐ | DEFER | P3 |
| 24 | `IsSaleUnit` | Đơn vị bán mặc định | MAP | `item_units.isDefaultSell` (MVP: ĐVT chính) |
| 25 | `IsCostUnit` | Đơn vị nhập mặc định | MAP | `item_units.isDefaultBuy` (MVP: ĐVT chính) |
| 26 | `ImageUrl` | Link ảnh | DEFER | P4 |
| 27 | `Height` | Chiều cao | MAP | `items.packageHeightCm` |
| 28 | `Width` | Chiều rộng | MAP | `items.packageWidthCm` |
| 29 | `Length` | Chiều dài | MAP | `items.packageLengthCm` |
| 30 | `Weight` | Cân nặng | MAP | `items.packageWeightGram` |
| 31 | `ShowLocation` | Vị trí trưng bày | DEFER | P4 |
| 32 | `StockLocation` | Vị trí lưu kho | DEFER | P4 |
| 33 | `IsUseLotNo` | Quản lý lô/HSD | DEFER | P4 |
| 34 | `SellBeforeDay` | Cận date | DEFER | P4 |
| 35 | `IsUseSerial` | Quản lý Serial/IMEI | DEFER | P4 |
| 36 | `ShowInMenu` | Hiển thị POS | MAP | `items.isPosVisible` |
| 37 | `Description` | Mô tả | DEFER | P3 |
| 38 | `Inactive` | Ngừng kinh doanh | MAP | `items.isActive` |
| 39 | `SizeRange` | Dãy size | MAP | `items.oddSize` |
| 40 | `Ingredient` | Thành phần | MAP | `items.composition` |
| 41 | `YearOfProduction` | Năm sản xuất | MAP | `items.manufactureYear` |
| 42 | `UnitPriceBox` | Giá thùng | DEFER | P4 |
| 43 | `UnitPriceWholeSale` | Giá sỉ | DEFER | P4 |

## Ghi chú runtime

- Cột `Tình trạng` là cột hệ thống khi review/export lỗi, không thuộc 43 cột gốc.
- CSV semicolon vẫn chỉ phục vụ sheet dữ liệu (`Danh sách hàng hóa`).

---
feature: report-filters-and-column-config
status: retrofit
---

# Intent — Bộ lọc tồn kho theo cây nhóm hàng và lưu cấu hình cột báo cáo

**Đây là hồ sơ bằng chứng lắp ngược.** Code đã viết trước, theo ba phản hồi rời của người
dùng trong một lượt; thư mục feature này dựng sau để chạy `verify.py` và giữ lại ảnh chụp.
Không có G0–G4, không có `04-units-of-work/`, và không có khối "Verification evidence" nào
được ghi vào `uow.md` — vì không có UoW nào để ghi. Chỉ có `02-requirements.md` (để id AC
phân giải được) và `07-verification.md` (kịch bản chạy).

## Ba việc

1. **Tổng hợp tồn kho — bộ lọc "Nhóm hàng hóa" chọn nhóm cha trả về rỗng.** Nhóm hàng là cây
   (`inventory_item_categories.parent_group_id`) và mọi mặt hàng chỉ gắn vào nhóm **lá**, nhưng
   `StockSummaryService.buildBaseQuery` lọc bằng `item.category_id = :categoryId`. Chọn
   `GIÀY DÉP` hay `PHỤ KIỆN` ⇒ 0 dòng, trong khi `TreeSelectInput` vẫn cho chọn hai nhóm đó.
2. **"Lưu Config column chưa được" ở Báo cáo Bán hàng.** `useReportColumnTemplate` chỉ bật khi
   `backendSource === "inventory"`, nên ở nhóm Bán hàng nút "Lưu" chỉ áp dụng tại chỗ và mất
   sau khi tải lại. Backend đã có sẵn `/reports/invoices/templates`.
3. **Kỳ báo cáo mặc định.** Báo cáo Bán hàng và Báo cáo Kho phải mở ở "Hôm nay" thay vì
   "Tháng này".

## Ngoài phạm vi

- Bật lưu cấu hình cột cho nhóm **Công nợ** và **Lợi nhuận**: `buildColumnCatalog` dựng catalog
  bằng `buildColumns(actor)` không kèm filter, mà `profit-by-item` /
  `supplier-debts-detail-by-document-and-product` đổi hẳn bộ cột theo "Thống kê theo" ⇒ lưu ở
  grain khác grain mặc định sẽ bị 400 `Unknown report columns`. Cần plumb `statBy`/`groupBy`
  vào DTO template trước, là một việc riêng.
- Các trang báo cáo kho legacy `/reports/storage/*` (không nằm trong sidebar).

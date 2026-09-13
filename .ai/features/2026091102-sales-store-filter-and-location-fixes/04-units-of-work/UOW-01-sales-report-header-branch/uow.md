---
id: UOW-01
slug: sales-report-header-branch
title: Báo cáo Bán hàng ở một chi nhánh chỉ lấy dữ liệu chi nhánh header, không còn dòng "Cửa hàng"
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: revert các file backoffice-web của UOW; không có thay đổi server, không có migration
---

# UOW-01 — Báo cáo Bán hàng ở một chi nhánh chỉ lấy dữ liệu chi nhánh header

Toàn bộ thay đổi nằm ở backoffice-web, chép mẫu báo cáo kho (`inventory-report-v2.api.ts:26-33, 105-113`).
Backend không đổi: `resolveReportBranchIds` đã xử lý đúng `store.group` (ADR-01).

## Demo script

Môi trường `local-backoffice`, tổ chức My Company, DB `erp_dev_3008`.

1. Đăng nhập tài khoản quản trị, chọn header **"Hồ Chí Minh"** (88 hóa đơn, có "Kho lưu trữ HCM").
2. Báo cáo > Bán hàng > **"Doanh thu theo mặt hàng"** → "Chọn báo cáo": **không có** dòng "Cửa hàng".
   Lặp lại với `daily_sales_summary`, `invoice_and_order_list`, `revenue_detail_by_invoice_and_product`.
3. Chọn kỳ bao trùm hóa đơn của HCM → "Lấy dữ liệu". DevTools > Network: body
   `POST /reports/invoices/search` có `filters.store = { scope: "group", storeIds: ["c3bf1922-3a2e-42d9-b00d-a7129efe592c"] }`.
   Ghi lại dòng Tổng.
4. Cột "Mã vị trí" / "Tên vị trí" có giá trị cho mặt hàng có kệ ở "Kho lưu trữ HCM".
5. Bấm "Xuất khẩu" rồi "In" → body export và print-payload mang đúng `filters.store` như bước 3.
6. Chuyển header sang **Chuỗi cửa hàng** → "Chọn báo cáo" có lại dòng "Cửa hàng". Chọn "Theo nhóm cửa hàng" =
   [Hồ Chí Minh] → "Lấy dữ liệu" → dòng Tổng bằng số ghi ở bước 3.
7. Vẫn ở chuỗi, chọn thêm "Chi Nhánh Đà Nẵng"; chuyển header về "Hồ Chí Minh" → "Lấy dữ liệu" → payload chỉ
   còn `storeIds: [HCM]`.
8. Đăng nhập tài khoản `local-backoffice-bm` (quản lý chi nhánh, không có quyền tổng hợp) → mở "Doanh thu
   theo mặt hàng" → có dữ liệu, không có toast 403 (A-03).

## In scope

- `buildSearchFilters` nhận `ctx` và ghim `store` cho 4 backend key Bán hàng ở chế độ một chi nhánh.
- Truyền `ctx` ở data fetcher, export và in.
- Bỏ `REPORT_FILTERS_LINE.STORE` khỏi 4 mảng `single_filterRegistry*`.
- Test hàm thuần trong `report.store.test.ts`.

## Not in scope

- Bất kỳ thay đổi nào ở `apps/api/`.
- Báo cáo lợi nhuận, công nợ, kho.
- Lệch quyền FE/BE, checkbox `statisticByBrand`, danh sách cửa hàng chưa được gán (xem Out of scope của intent).

## Risks

| Risk | Mitigation |
| --- | --- |
| `2026091002-report-multi-location-column` T-02-03 đang in_progress trên `report-revenue-by-product.registry.ts` (A-11) | Sửa khác dòng (`:145-146` so với độ rộng cột); kiểm `git log` file trước khi bắt đầu T-01-02, rebase nếu T-02-03 commit thêm |
| Người không có quyền tổng hợp bị 403 nếu header trỏ chi nhánh không được gán (A-03) | Bước 8 của demo dùng đúng vai trò đó |
| Ẩn dòng mà chưa ghim payload làm chế độ một chi nhánh mất khả năng chọn mà vẫn trả toàn tổ chức | T-01-02 phụ thuộc T-01-01 |

## Definition of done

- [x] AC-01 … AC-07 pass — Akenzy chấp nhận khi đóng plan ngày 11/09/2026: phần so tổng doanh thu của AC-02, bước 7 và bước 8 (A-03) chưa chạy trên trình duyệt
- [x] `rtk proxy npx --yes vitest run src/store/page-stores/report/report.store.test.ts` trong `apps/backoffice-web` xanh, không đỏ thêm test cũ (mốc 12/12)
- [x] `tsc --noEmit` của `apps/backoffice-web` sạch
- [x] Thay đổi trong `apps/api/` chỉ có T-01-03 (`invoiceFilterSummary` bỏ dòng "Cửa hàng" thừa trong tiêu đề Xuất khẩu/In) — thêm khi mở lại G3 ngày 2026-09-11
- [x] Demo script chạy đầu-cuối và được nghiệm thu ở G4 — Akenzy nghiệm thu khi đóng plan ngày 11/09/2026, với các bước chưa chạy ghi ở dưới

Trạng thái 2026-09-11:
- `report.store.test.ts` 17/17 (12 cũ + 4 của T-01-01 + 1 của T-01-02); `tsc --noEmit` backoffice exit 0. T-01-03: `document-subtitle.spec.ts`
  + `get-invoice-report-document.handler.spec.ts` 35/35, `tsc --noEmit` api exit 0.
- Đã kiểm trên trình duyệt (tổ chức MT, xem bằng chứng trong T-01-01 và T-01-02): payload ghim chi nhánh (AC-02, phần
  payload), cột vị trí có giá trị (AC-07), cả 4 báo cáo không có dòng "Cửa hàng" ở chế độ một chi nhánh (AC-01), chuỗi
  cửa hàng vẫn có dòng đó (AC-05). AC-03, AC-06 phủ bằng test đơn vị; AC-04 phủ bằng test nối `ctx` ở T-01-01 và T-01-03.
- **Chưa làm:** bước 3/6 so sánh tổng doanh thu một chi nhánh với Chuỗi cửa hàng "Theo nhóm cửa hàng" = [cùng chi
  nhánh] (phần tổng của AC-02); bước 7 (lựa chọn ở chuỗi không rò sang một chi nhánh) chưa chạy trên trình duyệt; bước 8
  cần tài khoản quản lý chi nhánh (`local-backoffice-bm`) mà `.ai/credentials.env` hiện không đăng nhập được.
- **Akenzy chọn bỏ qua các bước trên (2026-09-11).** Lần thử cuối, tab trình duyệt tự động hoá bị ẩn
  (`visibilityState: hidden`) nên menu chi nhánh không mở được. Akenzy nghiệm thu và đóng plan ngày 11/09/2026
  với các bước chưa chạy này.

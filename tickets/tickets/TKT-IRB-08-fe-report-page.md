# TKT-IRB-08 FE: Trang báo cáo (bảng 2 tầng header + cột động + dòng tổng) + Route + Nav

> **Trạng thái:** KHÔNG implement FE (theo chỉ đạo). Hướng dẫn dựng trang generic (dropdown report type → headers → dataRaw, header 2 tầng, filter từng cột, dòng tổng, template, mapping với `BaseDataTable`) nằm trong [`docs/invoice-report-fe-api-integration.md`](../../docs/invoice-report-fe-api-integration.md) — mục 5 (render) + 10 (checklist). Ticket này giữ làm tham chiếu thiết kế.

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Trang `backoffice-web` "Tổng hợp bán hàng theo ngày": bộ chọn cột (catalog gom theo band, gồm cột **động theo phương thức thanh toán**), bộ filter (khoảng ngày bắt buộc / status / loại / cửa hàng), **bảng 2 tầng header** (band "Doanh thu" / "Khách hàng thanh toán" colspan + cột con) với **dòng tổng (footer)**, và lưu/tải **template** (cột + filter). Đăng ký `<Route>` + `NavChild` dưới mục Báo cáo.

## Deliverables

- `apps/backoffice-web/src/pages/reports/InvoiceReportPage.tsx` — named export `InvoiceReportPage`, `interface Props` riêng (nếu cần). Gồm:
  - **PageToolbar** (đặt trong page): khoảng ngày (Từ ngày → Đến ngày), nút "Lấy dữ liệu", nút "Lưu template", dropdown "Tải template".
  - **Column picker**: catalog gom theo `group.id` (Doanh thu / Khách hàng thanh toán + cột không band Ngày/Thực thu), multi-select; cột cố định hiển thị `name` VI + `desc`; cột động hiển thị `name` = label payment-account.
  - **Filter bar**: khoảng ngày `issuedAt` (**bắt buộc**, default tháng hiện tại), `status`, `type`, chọn cửa hàng (`branchId`, ẩn/disable nếu không có quyền consolidated → "Tất cả" = toàn chuỗi).
  - **Bảng kết quả**: `BaseDataTable` (hoặc bảng hiện có) dựng **2 tầng header** từ `headers` của **API columns** (lọc theo cột đã chọn — `groupHeaders` → band colspan tầng trên, cột con + `desc` tầng dưới); **tầng filter** (hàng dưới header, như ảnh): mỗi cột một widget theo `type` (`date` → `=`/range, CURRENCY/NUMBER/PERCENT → compare `≤`/`≥`/`=`) → build `columnFilters[]` đưa vào search; mỗi dòng `dataRaw[i]` (`ReportCell[]`, từ **API search**) render qua `formatCell(cell)`, canh phải cho CURRENCY/PERCENT/NUMBER; **dòng tổng** từ `totals` ở footer; phân trang server-side theo ngày.
  - **Save/Load template**: dialog đặt tên → `useCreateInvoiceReportTemplate`; chọn template → đổ `columns`+`filters` vào state → trigger search.
- `apps/backoffice-web/src/App.tsx` — `<Route path="/reports/invoices" element={<InvoiceReportPage />} />` (đúng pattern route hiện có).
- `apps/backoffice-web/src/components/layout/navConfig.ts` — `NavChild` "Báo cáo hóa đơn" dưới group Báo cáo, icon `lucide-react`, gắn permission `reporting.invoice.branch.read` nếu navConfig hỗ trợ lọc theo quyền.

## Acceptance Criteria

- [ ] Vào trang → gọi catalog + danh sách template; chọn cột + khoảng ngày → "Lấy dữ liệu" gọi search, bảng hiện đúng cột đã chọn (một dòng / một ngày) + dòng tổng.
- [ ] Header 2 tầng đúng: band "Doanh thu"/"Khách hàng thanh toán" colspan đúng số cột con; cột không band (Ngày/Thực thu) đứng đầu; cột động hiển thị label payment-account.
- [ ] Chọn cột phương thức thanh toán động → mỗi ngày hiện đúng tổng tiền theo phương thức đó (0 nếu không có).
- [ ] Hàng filter dưới header (như ảnh): nhập `≤`/`=` ở một cột → search gửi `columnFilters` → bảng chỉ còn ngày thỏa; dòng tổng cập nhật theo tập đã lọc.
- [ ] Người không có quyền consolidated: bộ chọn cửa hàng khóa về branch hiện tại; có quyền: chọn cửa hàng bất kỳ hoặc "Tất cả" (toàn chuỗi).
- [ ] Lưu template (cột+filter) → xuất hiện trong dropdown; tải lại → dựng đúng cột + filter; xóa template hoạt động.
- [ ] Mọi UI string tiếng Việt; số/tiền/%/ngày format `Intl` `vi-VN` theo `cell.type`; primitives import từ `@erp/ui`; icon từ `lucide-react`.
- [ ] Có `<Route>` **và** `NavChild` (cả hai — đúng convention navigation).

## Definition of Done

- [ ] `backoffice-web` build/typecheck xanh; trang render không lỗi console.
- [ ] Verify trực quan: screenshot 1 báo cáo có cột động (phương thức thanh toán) + header 2 tầng + dòng tổng (mô tả diff so với ảnh tham chiếu).
- [ ] Server-data ở TanStack Query (không Zustand); state UI (cột/filter đang chọn) ở component/Context.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

- State trang: `selectedColumns: string[]`, `filters: InvoiceReportFilterPayload` (gồm `issuedAt` bắt buộc), `columnFilters: ColumnFilter[]` (từ filter row), `branchId?`, `page`. "Lấy dữ liệu" commit state → `useInvoiceReportSearch(payload)`.
- Bảng dựng từ **2 nguồn**: header = `groupHeaders(catalogHeaders.filter(h ∈ selectedColumns))` → 2 tầng `<thead>` (band colspan + cột con kèm `desc`) + hàng filter widget; thân = `searchResult.dataRaw.map(row => row.map(formatCell))`; footer = `searchResult.totals`.
- Cột động (`*.method.<id>`) render như cột số bình thường — không còn danh sách con to-many; mỗi ô là một số tiền theo ngày.
- Tải template: set `selectedColumns = tpl.columns`, `filters = tpl.filters`, rồi search.
- Tái dùng pattern trang report/list hiện có (`use-inventory-reports`, `CrudListPage`/`BaseDataTable`) cho phân trang; bảng 2 tầng header có thể cần render thủ công nếu `BaseDataTable` không hỗ trợ colspan band.

## Testing Strategy

- Verify trực quan (skill `verify`/`run`): chọn cột (gồm cột động) + khoảng ngày, đổi cửa hàng, lưu/tải template; chụp màn hình.
- E2E API-side ở TKT-09 (FE web app không có test runner thực — `echo "test"`).

## Dependencies

- Depends on: [TKT-IRB-07](./TKT-IRB-07-fe-data-layer.md).
- Blocks: [TKT-IRB-09](./TKT-IRB-09-tests-e2e.md).

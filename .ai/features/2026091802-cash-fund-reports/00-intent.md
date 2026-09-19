---
feature: cash-fund-reports
slug: 2026091802-cash-fund-reports
owner: Akenzy
created: 2026-09-18
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Báo cáo "Quỹ tiền" (thu chi tiền mặt / tiền gửi) trong backoffice

## Problem

Chủ cửa hàng và kế toán của chuỗi giày đang đối soát quỹ tiền mặt và tiền gửi hằng ngày /
cuối tháng trên MShopKeeper (`giaymt.mshopkeeper.vn/main#rp_monetaryflow`, nhóm báo cáo
"Quỹ tiền"). jack-erp đã có đủ nghiệp vụ chứng từ — phiếu thu/chi tiền mặt
(`modules/accounting/cash-vouchers/`), phiếu thu/chi tiền gửi (`deposit-vouchers/`), mục
thu/chi (`cash_voucher_categories`), POS tự sinh phiếu thu bán hàng
(`cash-voucher-consumers/pos-cash-sale.consumer.ts`, `deposit/consumers/pos-deposit-sale.consumer.ts`)
— nhưng **không có báo cáo tổng hợp nào trên dữ liệu đó**. Menu "Báo cáo" hiện có 4 nhóm
(Bán hàng, Kho, Công nợ, Lợi nhuận); nhóm `REPORT_CATEGORY.CASH_FUND` đã được khai enum +
6 nhãn từ trước (`constants/reports/report-type.constant.ts:167-174, 450-457`) nhưng khối
metadata đang bị comment (`report-category.constant.ts:111-114`), không có route, không có
backend. Trang cũ `/reports/cash` (`pages/reports/CashReportPage.tsx`) chỉ là đối soát ca
POS, không thay thế được.

Hệ quả: muốn biết tiền đầu kỳ / thu / chi / cuối kỳ, hay chi theo mục, người dùng vẫn phải
đăng nhập MShopKeeper. Đây là một trong những lý do chưa bỏ được MShopKeeper.

Bộ báo cáo tham chiếu gồm 6 báo cáo trong một dropdown "Chọn báo cáo"; feature này làm 5
(báo cáo #1 tạm hoãn, xem Out of scope):

| # | MShopKeeper | Backend key | Cột / dòng |
| --- | --- | --- | --- |
| 2 | Tình hình thu chi | `cash-in-out-situation` | Khoản mục · Tiền mặt · Tiền gửi · Tổng cộng. Dòng: I. Tiền đầu kỳ; II. Tiền thu trong kỳ (đậm) → Thu từ bán hàng, Thu khác (+ mục thu); III. Tiền chi trong kỳ (đậm) → Chi mua hàng hóa, mỗi mục chi có phát sinh một dòng, Chi khác; IV. Tiền cuối kỳ = I + II − III (ô Tiền mặt / Tiền gửi là link drill-down sang #3). Không có dữ liệu vẫn giữ khung I–IV, ẩn mục = 0 |
| 3 | Bảng kê thu chi | `cash-in-out-list` | Ngày chứng từ📌, Số chứng từ📌, Loại chứng từ📌(enum), Tham chiếu📌, Tiền thu, Tiền chi, Số dư cuối kỳ (luỹ kế), Phương thức thanh toán, Tài khoản ngân hàng, Nhân viên thu/chi, Mã đối tượng☐, Đối tượng nộp/nhận, Diễn giải, Mã cửa hàng, Tên cửa hàng, Số hóa đơn☐. Dòng đầu "Số dư đầu kỳ" |
| 4 | Chi tiền theo mục chi | `expenses-by-category` | ID Mục chi☐, Mục chi (link → #5), Loại Mục chi☐, Số tiền chi. Sắp giảm dần, dòng tổng cuối bảng |
| 5 | Bảng kê tiền chi theo mục chi | `expense-list-by-category` | Ngày chứng từ📌, Số chứng từ📌(link), Tài khoản ngân hàng, Phương thức thanh toán(enum), Diễn giải, Giá trị, Mã đối tượng☐, Đối tượng, Người nhận, Nhân viên chi, Mã cửa hàng, Tên cửa hàng, Số hóa đơn☐. Dòng "TỔNG CHI" trên cùng, mỗi mục chi một dòng nhóm (tên + tổng nhóm) rồi các dòng chi tiết; phân trang trên danh sách đã làm phẳng |
| 6 | Chi tiền theo thời gian | `expenses-by-time` | Ngày (link → #5), Số tiền chi; mỗi bucket (Ngày / Tuần / Tháng / Quý / Năm) một dòng, dòng tổng cuối bảng |

☐ = ẩn mặc định (bật trong "Sửa mẫu"), 📌 = ghim mặc định.

Khung trang dùng chung (đã có sẵn trong `pages/chain-store/reports/ReportPage.tsx`): tiêu đề
+ phụ đề "Xem theo cửa hàng: … / Nhân viên: …", thanh công cụ (kỳ báo cáo, Từ ngày / Đến
ngày, "Lấy dữ liệu" | "In ▾", "Xuất khẩu", bánh răng → "Sửa mẫu"), lưới có hàng lọc theo cột
(`=` ngày, `*` chứa, `≤` số, dropdown enum), dòng tổng chân bảng, phân trang 50/trang, ô xanh
là drill-down. Dialog "Chọn báo cáo": #3/#5 thêm Cửa hàng (Tất cả | Theo nhóm cửa hàng),
Nhân viên, Phương thức thanh toán; #6 thêm Thống kê theo, Mục chi; #2/#4 lấy chi nhánh
đang chọn trên header (bằng chứng: #4 tổng 239.245.000 cho một chi nhánh, #5 "Tất cả"
4.512.563.722).

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Chủ chuỗi / kế toán tổng | Mở MShopKeeper, chọn "Tất cả cửa hàng", đọc Tình hình thu chi và Bảng kê tiền chi theo mục chi để chốt tháng | Mở Báo cáo → Quỹ tiền trong backoffice, cùng số liệu, xuất Excel / in từ đây |
| Quản lý chi nhánh | Xem thu chi của chi nhánh mình trên MShopKeeper | Cùng màn hình, phạm vi tự khoá về chi nhánh được gán (`resolveReportBranchIds`) |
| Thu ngân / nhân viên kho | Không có quyền xem | Vẫn không thấy menu; API trả 403 (`reporting.cash.read`) |

## Success signal

Với cùng chi nhánh và cùng kỳ (vd chi nhánh Mậu Thân – CT, "Năm nay"), trên dữ liệu chứng
từ tương đương, **từng con số** của 5 báo cáo trong jack-erp — I / II / III / IV, tổng
từng mục chi, tổng từng ngày, dòng tổng bảng kê — **bằng MShopKeeper đến đơn vị đồng**.
Kiểm chứng thủ công theo quy trình ghi ở Definition of done của từng UoW; không có deadline.

## Out of scope

- **Báo cáo #1 "Bảng kê biên bản bàn giao ca"** — chủ sở hữu quyết định tạm hoãn
  2026-09-18 (A-06). Repo chỉ có `pos_sessions` + `pos_session_reconciliations`, không có
  bản ghi bàn giao (thu ngân giao / nhận, bảng kê mệnh giá); cần một feature riêng dựng
  thực thể đó trước.
- **Lọc theo ca làm việc** (`REPORT_FILTERS_LINE.WORK_SHIFT` chỉ là enum, backend không có
  filter) — cùng lý do.
- **Cột "Tên thẻ"** của MShopKeeper — jack-erp không mô hình hoá tên thẻ trên chứng từ
  (A-04); bỏ cột.
- **PDF phía server** — "In" giữ cơ chế hiện có: `POST print-payload` → FE render HTML →
  `window.print` (`lib/print/render-report-table-html.ts`).
- **Khoá kỳ quỹ tiền mặt** hay cột số dư đầu kỳ trên `cash_accounts` — số dư đầu kỳ tính
  từ chứng từ đã ghi sổ (A-03); thêm cột / khoá kỳ là quyết định kế toán riêng.
- **Đối chiếu với `cash_movements.created_at`** — báo cáo lấy ngày chứng từ (A-01, ADR-02);
  trang Sổ quỹ hiện có (`/v2/cash-ledger/search`) vẫn chạy trên `created_at`, không đụng.
- **Nhập lịch sử từ MShopKeeper** để so song song — feature dữ liệu riêng.

## Constraints

| Kind | Detail |
| --- | --- |
| Kiến trúc | Một domain báo cáo mới `cash` trong report-core (`modules/reporting/report-core/`), nhân bản `modules/reporting/debt-report/` (cùng bộ route `columns / filter-options / search / templates CRUD / export / print-payload`, cùng envelope `InvoiceReportResult { rows, totals, total }`). Không mở rộng `/v2/cash-vouchers/search`. |
| Nguồn dữ liệu | Chỉ chứng từ `status = POSTED`: `cash_receipts`, `cash_payments` (+ `_lines.category_id`), `bank_receipts`, `bank_payments` (+ lines). Không đọc `cash_movements` / `deposit_movements` (không có mục, không có mục đích, bên tiền mặt không có ngày chứng từ). |
| Phạm vi chi nhánh | Như báo cáo công nợ: `StoreScopeDto { scope: all \| group, storeIds }` + `resolveReportBranchIds(hasConsolidated, …)` (`report-core/report-query.util.ts`); quyền `reporting.cash.read` (floor) + `reporting.cash.consolidated.read` + 5 key theo báo cáo trong `REPORT_PERMISSION_KEYS`. |
| Quyền | Thêm dòng `permissions` bằng migration theo mẫu `1789700000000-GranularReportPermissions.ts`; cấp cho vai trò trong `database/seeds/org-role-permissions.ts`; `report-permissions.contract.spec.ts` phải xanh. |
| Kỳ báo cáo | FE resolve preset → `from/to` (`PeriodSelect`, `packages/ui/.../period-filter.tsx`); BE chỉ nhận `DateRangeFilterDto`. |
| Tiền | `numeric(18,2)`, tổng bằng SQL; hiển thị `vi-VN`. |
| Dòng phân cấp | Dòng đậm / thụt lề / dòng nhóm dùng `bold` / `indentLevel` như `profit-report/business-results.aggregator.ts` — FE `ReportPageTable` đã render. |
| Contract | Sau khi có endpoint: chạy API rồi `pnpm openapi:generate`, commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`. |
| Test | Jest unit cho từng `*.report.ts` (như `debt-report/reports/*.spec.ts`), e2e trên `erp_test` (`apps/api/test/e2e/`). backoffice-web không có test runner → type-check + `aidlc-verify` env `local-backoffice`. |
| UI | Chuỗi tiếng Việt; primitives từ `@erp/ui`; icon `lucide-react`; nav sinh tự động từ `REPORT_CATEGORY_METADATA` (`navConfig.ts:315`). |

## Existing surface touched

- Reused components: `report-core/{report-definition,report-query.util,column-filter.util,report-template.entity,report-export.service,report-permission.guard}.ts`, `report-core/export/*`, `profit-report/business-results.aggregator.ts` (mẫu dòng theo mục), `cash-vouchers/queries/search-cash-vouchers-v2.handler.ts` (WHERE/JOIN gộp thu-chi), `cash-vouchers/cash-ledger/cash-ledger.service.ts` (số dư luỹ kế), FE `pages/chain-store/reports/**` (`ReportPage`, `ReportPageTable`, `ColumnConfigDialog`, `ReportExportButtons`, `ReportDrillDownDialog`, `ReportFilterLine/*`).
- Adjacent features: `2026090404-report-permissions` (cách thêm quyền theo báo cáo), `2026091104-cash-voucher-category-options`, `EPIC-15072026-debt-reports` / `docs/24-debt-reports-spec.md` (domain gần nhất), `EPIC-16072026-profit-reports` (business-results).
- Entry points: một route mới `/reports/cash-fund` (`App.tsx`) + bật khối `REPORT_CATEGORY.CASH_FUND`; một module NestJS mới `modules/reporting/cash-fund-report/` đăng ký trong `app.module.ts`; một nhánh `backendSource: "cash"` trong 4 dispatcher `pages/chain-store/reports/_api/*.ts`.

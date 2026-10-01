---
feature: customer-points-ui-fixes
verified: 2026-10-01
environment: local — API erp3 (`DB_NAME=erp_dev_3008 pnpm --filter @erp/api dev`), backoffice erp3 Vite :3005, Chromium 1440×900
---

# Verification — Điểm thành viên, tương phản bảng, Quản lý vai trò, dòng trống CTKM

Ảnh và `summary.json` nằm ở `evidence/` (git-ignored, mỗi UoW một thư mục). Script chụp nằm ở
thư mục feature, chạy lại được:

| Script | UoW | Ghi DB? |
| --- | --- | --- |
| `capture-customer-points.py` | UOW-01 | Có — 1 cặp ADJUST +80/−80 cho khách *A THỦY* mỗi lần chạy (đã chạy 3 lần → 6 dòng trên `erp_dev_3008`); số dư trả về 1.078 |
| `capture-table-contrast.py` | UOW-02 | Không |
| `capture-role-perf.py` | UOW-03 | Không |
| `capture-promo-blank-rows.py` | UOW-04 | Có — thêm 2 dòng vào CTKM `923525f9…` (CTKM-A), lưu qua UI, rồi xoá lại; còn đúng 1 dòng như ban đầu |

**Mô phỏng** (ghi rõ vì không phải tài khoản/dữ liệu thật):
- *Không có quyền* (AC-06, AC-12): cùng tài khoản admin, trình duyệt gỡ 2 khoá khỏi mọi response `/auth/*`. Không có tài khoản NV bán hàng trong `.ai/credentials.env`.
- *Khách chưa có thẻ* (AC-07 UI): stub `GET /customers/:id/summary` trả `membership: null`. Không tổ chức nào có khách thiếu thẻ — tạo khách tự cấp thẻ. 404 của API thì e2e kiểm thật.
- *Cột ghim* (AC-16): chỉ màn Đơn hàng có cột ghim, mà `erp_dev_3008` không có đơn. Gán đúng inline style của ô ghim (`hsl(var(--row-bg))`) cho một cột trên danh mục Hàng hoá rồi đo màu.

## UOW-01 — Điểm thành viên

| AC | Bằng chứng | Kết quả |
| --- | --- | --- |
| AC-01 | `uow-01/1-detail-panel.png`, `2-edit-panel.png` — mã thẻ `MC1C2B04F9CC` ở cả chi tiết và form sửa, chỉ đọc | ✅ |
| AC-02..AC-08 | e2e `customer-points-balance.e2e-spec.ts` | ✅ 11/11 |
| AC-06 (UI) | `6-no-permission.png` — không có nút *Điều chỉnh điểm* (mô phỏng) | ✅ |
| AC-07 (UI) | `7-no-card-stubbed.png` — "Chưa có thẻ", có nút *Cấp thẻ*, không nút điều chỉnh (mô phỏng) | ✅ |
| AC-09 | `3-adjust-dialog.png`, `4-after-adjust.png` — 1.078 → 1.158 không tải lại trang | ✅ |
| AC-10, AC-11 | e2e `customer-point-history.e2e-spec.ts` | ✅ 4/4 |
| AC-12 | `5-history-tab.png` — dòng đầu *Điều chỉnh +80*, ghi chú, *Admin User*; `6-no-permission.png` — không có tab (mô phỏng) | ✅ |
| AC-13 | e2e `customer-points-permissions.e2e-spec.ts` (3/3); `migration:run → revert → run` trên `erp_dev_3008`: 0 → 18 → 0 → 18 dòng, chỉ 3 vai trò quản lý × 3 tổ chức | ✅ |
| AC-14 | `org-role-permissions.spec.ts` — 3 test mới xanh | ✅ |

## UOW-02 — Tương phản dòng bảng

Màu đo từ DOM (`getComputedStyle`), theme misa:

| Trạng thái | Trước (`uow-02-before/`) | Sau (`uow-02/`) |
| --- | --- | --- |
| Dòng chẵn | `rgb(245,245,245)` | `rgb(255,255,255)` |
| Dòng lẻ | `rgba(237,237,237,0.2)` — gần như trùng dòng chẵn | `rgb(235,236,240)` |
| Hover | `rgba(246,248,254,0.7)` | `rgb(220,235,254)` xanh |
| Dòng chọn (*Quản lý vai trò*) | không tô | `rgb(230,218,252)` tím + viền trái, giữ tím khi hover |
| Cột ghim | trong suốt / màu tính sẵn, không theo hover | theo đúng màu dòng (mô phỏng) |

| AC | Bằng chứng | Kết quả |
| --- | --- | --- |
| AC-15 | `items-simulated-frozen-1-stripes.png`, `roles-1-stripes.png` | ✅ |
| AC-16 | `items-simulated-frozen-2-hover.png` (ô ghim xanh cùng dòng — mô phỏng), `roles-2-hover.png` | ✅ |
| AC-17 | `roles-3-selected.png`, `roles-4-selected-hover.png`; theme tối `roles-dark-*` | ✅ *Quản lý vai trò*; *Đơn mua hàng* / *Đơn hàng* không có dữ liệu local |
| AC-18 | `promo-line-item-grid-hover.png` (LineItemGrid) | ✅ |

Phần còn thiếu ở lần đầu (`CrudListPage`, bảng/popup tự viết, báo cáo) đã làm ở **UOW-05** bên dưới.

## UOW-05 — Mọi bảng backoffice (reopen G3, trừ POS và mẫu in)

`capture-table-everywhere.py` (16/16 PASS) + `capture-table-contrast.py` chạy lại (14/14 PASS, bước `report`):

| AC | Bằng chứng | Kết quả |
| --- | --- | --- |
| AC-22 | `uow-02/report-*.png` — *Tổng hợp bán hàng theo ngày*, cột ghim *Ngày* thật: sọc + hover cả ô ghim | ✅ |
| AC-23 | `uow-05/items-ticked.png` (tick 2 dòng danh mục Hàng hoá), `programs-ticked.png`, `cash.selected` (Phiếu thu), `provider-groups.selected` | ✅ |
| AC-24 | `table-contrast-coverage.test.ts` — 52 bảng dùng `.erp-data-table`, 3 miễn có lý do (`RegistrationDetailPage` bảng thuộc tính, `VariantMatrixView` ma trận 2 trục, `SalesReportPage` cặp chỉ tiêu/giá trị); file thăm dò thiếu class làm test đỏ | ✅ |
| AC-25 | popup tra cứu `lookup-field-highlight.png` (sọc + dòng đang trỏ tím); chi tiết hoá đơn `invoice-lines-hover.png`; lưới CTKM tặng hàng `gift-grid-hover.png`; chi tiết phiếu thu `cash-detail-hover.png`; chi tiết phiếu nhập `receipt-detail-hover.png`; nhóm NCC `provider-groups-*.png` | ✅ |

Ô nhập trong dòng (`@erp/ui Input`, `bg-background`) nay trong suốt trong `.erp-data-table` (A-21 sửa) — trước đó lưới CTKM tặng hàng chỉ thấy màu ở ô `≤`.

**Dữ liệu tạo trên `erp_dev_3008` để chụp (Akenzy duyệt "Tạo dữ liệu"):**
- 3 nhóm NCC `NCC-UOW05-A/B/C` — **đã xoá** sau khi chụp.
- CTKM tặng hàng tạm `7f37a63c…` (STOPPED, không tự áp dụng) — **đã xoá**.
- Phiếu thu tiền mặt `PT000141` (3 dòng, 300.000đ) — `POST /cash-receipts` **ghi sổ ngay**, có bút toán; **còn lại** vì chứng từ đã ghi sổ không xoá, chỉ huỷ/đảo được.

Không có dữ liệu local, không chụp được (dùng bảng cùng nhóm thay): chi tiết kiểm kê (0 phiếu), panel đơn hàng (0 đơn).

## UOW-03 — Quản lý vai trò

| AC | Bằng chứng | Kết quả |
| --- | --- | --- |
| AC-19 | e2e `users-list-role-ids.e2e-spec.ts` (2/2) + `user-branch-scope.e2e-spec.ts` vẫn xanh (5/5) | ✅ |
| AC-20 | Trước: `uow-03/0-before-client-prod.png` (ảnh client, ~120 request `/admin/users/{id}`). Sau: `summary.json` — 0 request chi tiết; trang gọi `/admin/roles` + 1 trang `/admin/users` (5 request còn lại là vỏ app khi tải lại trang). `2-role-users.png` — *Quản lý chi nhánh* hiện đúng 2 người như ảnh chụp trước thay đổi | ✅ tải trang; gán/bỏ người dùng chưa chạy qua UI |

## UOW-04 — Dòng trống CTKM

| AC | Bằng chứng | Kết quả |
| --- | --- | --- |
| AC-21 (unit) | `promotion.mapper.spec.ts` — 9/9 | ✅ |
| AC-21 (UI) | Trước: `0-before-client-prod.png` (client), `1-legacy-blank-row.png` (tái hiện: dòng PRODUCT trỏ id item hiện trống ở giữa). Sau: `2-after-save.png` — mã `["SKU-685","ABA2799-D-39",""]`; DB chỉ còn 2 dòng ITEM, dòng cũ và dòng gõ dở bị bỏ | ✅ |

## Build và test

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @erp/backoffice-web build` | ✅ |
| `pnpm --filter @erp/api build` | ✅ |
| `pnpm --filter @erp/api test -- src/modules/customer src/modules/rbac src/database/seeds` | 439/440 — 1 đỏ **có sẵn trên `main`**: `withholds inventory.transfer.create from SALES and CASHIER` |
| `test:e2e` 4 file mới + `user-branch-scope` | ✅ |
| `test:e2e -- loyalty` | ❌ 6 test **đỏ trên `main`**: tạo khách tự cấp thẻ nên `POST :id/membership-card` → 409, `membership` không còn null. Không test nào gọi endpoint mới |

## Ngoài lề phát hiện được

- `packages/api-client` trên `main` chưa sinh lại sau #301 (`productId`, `MobileLocationStockDto`). T-01-04 sinh lại nên kéo theo phần đó.
- `apps/api/.env` khai `DB_NAME` hai lần (`erp_dev`, rồi `erp_clone_prod` không tồn tại) — `make dev-api` chết nếu không đặt `DB_NAME`.

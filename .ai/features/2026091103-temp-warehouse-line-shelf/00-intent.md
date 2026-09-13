---
feature: temp-warehouse-line-shelf
slug: 2026091103-temp-warehouse-line-shelf
owner: Akenzy
created: 2026-09-11
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Kho tạm hiện kệ của phiên (A01.01) thay vì kệ đã quét của dòng

Nguồn: QA mục **9. Chuyển kho tạm**, ngày 2026-09-11, ảnh chụp trên prod (`erp.giaymt.com.vn`).

> *"Hiện thị sai vị trí của mã hàng, Đang hiển thị A01.01 ?"* — ví dụ MY1901-D-37 ở chi nhánh MT211 Đà
> Nẵng: POS hiện A01.01, còn "Chi tiết vị trí hàng hóa" (A05.03, Kho 211DN, tồn 4) và báo cáo "Hàng hóa
> xuất kho tạm" (A05.03) đều đúng.

**Tách từ `2026091102-sales-store-filter-and-location-fixes` ngày 11/09/2026.** Akenzy chọn tách để mục 8
và 10 đi tiếp trong khi plan này chờ kết quả SQL trên prod cho A-01. Nội dung là P3 của plan cũ — đã qua
G0 ở đó — giữ nguyên, chỉ đánh lại id.

## Problem

**Ô Vị trí là một bản chụp chữ.** `locationLabelForLine` trả `line.notes`
(`apps/pos-web/src/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers.ts:34-36`). Lúc quét,
`applyPreferredShelf` (`apps/pos-web/src/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions.ts:140-183`)
tra kệ ưu tiên trong kho lưu trữ (`resolveStorageIdForShelf` `:36-45` — cả hai tab đều tra phía kho), rồi
`mapDraftToAddBody` (`temp-warehouse-mappers.ts:98-114`) lưu `notes` = tên kệ và `sourceLocationId` = id
kệ. Tới đây vẫn đúng.

**Sửa → Lưu ghi đè chữ bằng kệ của phiên.**

1. API gắn `sourceLocation`/`destinationLocation` là **kệ của phiên**, giống nhau cho mọi dòng
   (`apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts:944-965`).
2. `syncFromLines` (`apps/pos-web/src/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store.ts:109-119`)
   dựng lại sản phẩm trong cache từ các dòng bằng `catalogLineFromTempWarehouseLine`
   (`picker-cache.ts:39-64`) — danh sách kệ chỉ có kệ của phiên — và **ghi đè** cả sản phẩm vừa quét có
   kệ thật.
3. Bấm "Sửa": `locationFromLine` (`fast-stock-transfer-pickers.ts:51-73`) không thấy `sourceLocationId` thật
   trong danh sách đó ⇒ giữ id thật nhưng lấy **tên** từ `line.sourceLocation` (kệ phiên).
4. Bấm "Lưu": `mapDraftToPatchBody` (`temp-warehouse-mappers.ts:116-129`) ghi `notes = "A01.01"`.

Kho 211DN không có kệ `is_default`, nên kệ của phiên là kệ đang hoạt động tạo sớm nhất. Snapshot
`erp_dev_3008` (30/08): `temp_warehouse_sessions.warehouse_location_id` của MT211 trỏ A01.01.

**Id vẫn đúng, chỉ chữ sai — theo snapshot.** 2.061 dòng "Xuất đi" của MT211: 2.054 dòng có `notes` khớp kệ
nguồn, và mọi `source_location_id` đều là kệ có tồn + liên kết của đúng mặt hàng đó. MY1901-D-37 ở Kho
211DN: liên kết và tồn đang theo dõi tại A05.03 (4). Báo cáo "Hàng hóa xuất kho tạm" tính kệ lúc đọc
(`apps/api/src/modules/inventory-reports/services/temp-warehouse-report.service.ts:502-544`) nên hiện đúng.
Dòng ngày 10/09 không nằm trong snapshot — đó là A-01.

**Bổ sung 2026-09-11 (kiểm DB local).** Lỗi không chỉ ở MT211. Cả 24 dòng "Xuất đi" của tổ chức MT có `notes` lệch kệ
nguồn đều sinh ra từ Sửa → Lưu (có dòng trước trỏ `superseded_by_id` vào). Chúng rải ở 7 chi nhánh, và `notes` là kệ
của phiên: A01.01 ở Kho 211DN, "999" ở nhiều kho khác. Không dòng nào có kệ nguồn là kệ mặc định hay "Chưa xếp". Chi
tiết ở `01-assumptions.md`, mục "Bằng chứng từ DB local".

`temp_warehouse_lines.notes` không có chỗ đọc nào khác ngoài nhãn này: backend chỉ ghi hoặc sao chép
(`temp-warehouse.service.ts:392`, `:487`, `:1569`); các `notes` mà báo cáo kho đọc thuộc bảng chứng từ khác.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Thu ngân POS, màn Kho tạm | Sau Sửa → Lưu, Vị trí thành kệ phiên A01.01; đi lấy hàng sai kệ | Vị trí luôn là kệ đã quét của dòng |

## Success signal

POS Kho tạm MT211: MY1901-D-37 hiện A05.03 — trước và sau Sửa → Lưu, sau khi tải lại trang — và các dòng đã
bị ghi sai từ trước cũng hiện đúng mà không cần sửa dữ liệu.

## Out of scope

- **Sửa dữ liệu `notes` đã ghi sai trên prod.** Hiển thị chuyển sang đọc theo id nên không cần (A-03).
- **Quy tắc chọn kệ lúc quét (`getPreferredShelf`) và kệ mà phiếu chuyển dùng** (`source_location_id`,
  materializer) — không đổi.
- **Tính lại kệ ưu tiên hiện tại lúc đọc như báo cáo.** A-02 đã chốt hiện kệ đã quét.
- **`use-fast-stock-transfer-data.ts`, `fast-stock-transfer-warehouse-defaults.ts`** — đang được
  `2026091003-default-issuing-warehouse` T-02-01 sửa.

## Constraints

| Kind | Detail |
| --- | --- |
| Prod | Máy lập plan không truy cập được DB prod ⇒ A-01 phải do người có quyền chạy SQL (xem `01-assumptions.md`) |
| Hợp đồng dùng chung | `TempWarehouseLine` nằm ở `packages/shared-interfaces/src/inventory/temp-warehouse.ts:60-90`; gói resolve qua `dist` (`main: dist/index.js`) ⇒ sửa type xong phải `pnpm build:shared` |
| Làm song song | `2026091003-default-issuing-warehouse` T-02-01 (in_progress) sửa `use-fast-stock-transfer-data.ts` và `fast-stock-transfer-warehouse-defaults.ts` — plan này không đụng hai file đó |
| Kiểm thử FE | `apps/pos-web` ghi `"test": "echo test"`; test hàm thuần chạy bằng `rtk proxy npx --yes vitest run <file>` (A-05). Mốc: lib `fast-stock-transfer` 14/14 |
| Kiểm thử API | `temp-warehouse.service.spec.ts` 35/35 |
| Dữ liệu local | API chạy `erp_dev_3008`. My Company, chi nhánh Hồ Chí Minh: "Kho lưu trữ HCM" có kệ phiên A01.02; ABA2777-D-41 và ABA2777-D-42 có kệ ưu tiên A01.01 (tồn 37) |
| Schema | Không migration |
| Ngôn ngữ | Chuỗi hiển thị tiếng Việt |

## Existing surface touched

- **API:** `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` (+ spec).
- **Hợp đồng:** `packages/shared-interfaces/src/inventory/temp-warehouse.ts`.
- **POS:** `temp-warehouse-mappers.ts`, `picker-cache.ts`, `fast-stock-transfer-pickers.ts` (thư mục
  `apps/pos-web/src/lib/page-libs/fast-stock-transfer/`, kèm test), `use-fast-stock-transfer-actions.ts`.
- **Mẫu noi theo:** lượt nạp kệ gom `IN (...)` sẵn có ở `loadLocations` (`temp-warehouse.service.ts:1020-1035`).

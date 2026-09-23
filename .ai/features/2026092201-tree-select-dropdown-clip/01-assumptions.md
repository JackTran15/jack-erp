---
feature: tree-select-dropdown-clip
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Sửa tại `TreeSelectInput` (một chỗ) chứ không vá riêng dialog Danh mục thu chi; mọi host của picker nhận cùng hành vi | high | no | Nếu chỉ muốn sửa một dialog: bọc riêng trong `CrudFormDialog`, các host khác giữ nguyên | confirmed | Akenzy chốt 22/09/2026 khi duyệt plan: sửa tại component, mọi host nhận cùng hành vi (AC-06…08 hồi quy) |
| A-02 | Chép cách của `LookupField` vào `TreeSelectInput` (portal vào `[role="dialog"]` gần nhất, fallback `body`; `position: fixed`; lật lên trên khi thiếu chỗ; đo lại khi cuộn/resize; `data-lookup-popover`) — **không** trích hook dùng chung, **không** sửa `LookupField` | medium | yes | Nếu muốn hook dùng chung: T-01-01 đụng thêm `LookupField.tsx` (10 host: dialog phiếu kho, chọn kho, tạo hàng hoá…) và cần hồi quy các dialog đó | confirmed | Akenzy chọn "Chép LookupField vào TreeSelectInput" ngày 22/09/2026; không đụng LookupField, không trích hook |
| A-03 | Khung danh sách cao tối đa 320px (≈10 dòng) thay vì 256px hiện tại, thu theo chỗ trống trong viewport, tối thiểu 140px | medium | no | Đổi hai hằng số | confirmed | Akenzy chọn "320px ≈ 10 dòng" ngày 22/09/2026, kèm auto-tải trang tiếp (A-05) |
| A-04 | Bỏ `bodyClassName="overflow-visible"` ở `CrudFormDialog` để body modal cuộn lại; giữ kích thước 720×560 cho entity cây | high | no | Nếu giữ: form entity cây vẫn không cuộn được ở màn hình thấp | confirmed | Akenzy chốt 22/09/2026 cùng lượt duyệt plan: bỏ vá, giữ 720×560 |
| A-05 | Khi trang đầu (PAGE_SIZE 8) không lấp đầy khung mà server còn trang sau, tự tải trang tiếp — như LookupField — thay vì tăng PAGE_SIZE. Với khung 320px điều này là bắt buộc: 8 dòng ≈ 270px không tạo thanh cuộn nên `onScroll` không bao giờ bắn | high | no | Nếu tăng PAGE_SIZE thay thế: một hằng số | confirmed | Akenzy chốt 22/09/2026 cùng A-03: auto-tải thay vì tăng PAGE_SIZE |
| A-06 | Bằng chứng: `tsc --noEmit` của backoffice-web + kịch bản ai-dlc-verify (`07-verification.md`, viewport desktop và laptop) + demo tay trên Chrome của Akenzy; không viết unit test vì app không có runner | high | no | Nếu cần unit test: phải dựng vitest cho backoffice-web — ngoài phạm vi | confirmed | Akenzy chốt 22/09/2026 khi duyệt plan: tsc + 07-verification + demo tay; không dựng runner |
| A-07 | Làm trên nhánh mới `fix/tree-select-dropdown-clip` từ `main`, lên PR như #282 | medium | no | Đổi nhánh | confirmed | Akenzy chốt 22/09/2026: nhánh `fix/tree-select-dropdown-clip` từ `main` |
| A-08 | Không đụng `SearchListingInput` (cùng bệnh, không được báo) và không sửa ghi chú ở `StockSummaryFilterPopover` | high | no | Thêm ticket | confirmed | Akenzy chốt 22/09/2026 khi duyệt plan: ngoài phạm vi |
| A-09 | Lỗi thứ hai lộ ra khi chạy bằng chứng AC-02: `BaseCrudService.applySorting` chỉ `ORDER BY createdAt` nên phân trang LIMIT/OFFSET bỏ/lặp dòng khi trùng timestamp (19 mục seed của My Company cùng `created_at`; picker thiếu `CHI_CCDC`). Sửa tận gốc ở API bằng tiebreaker `id` thay vì vá riêng picker | high | no | Nếu chỉ vá FE (`sortBy=id`): các list CRUD generic khác vẫn lặp/bỏ dòng | confirmed | Akenzy chọn "Thêm T-01-03 vào plan này" ngày 22/09/2026 sau khi xem mô phỏng SQL (CHI_DUNG_CU_SUA_DEP xuất hiện 3 lần qua 5 trang) |

## Bằng chứng đã xem

- `TreeSelectInput.tsx:426`: `<div className="absolute z-50 mt-1 w-full …">`; `:335-348` handler click-ngoài chỉ so
  với `wrapRef`; `PAGE_SIZE = 8`; `max-h-64` (256px).
- `app-modal.tsx:508` `[contain:layout_paint]`, `:607` lớp bọc body `overflow-hidden`, `:619` body `overflow-auto` +
  `bodyClassName`; `:529-551` guard click-ngoài bỏ qua `[data-lookup-popover]` và `[role="dialog"]`.
  `git show 4ae99236:packages/ui/src/components/app-modal.tsx` — cả hai dòng 508/597 đã có tại #282.
- `CrudFormDialog.tsx:443` `bodyClassName={isTreeEntity ? "overflow-visible" : undefined}`, thêm ở `4ae99236` (#282).
- `LookupField.tsx:346-404` (đo và portal), `:333-343` (click-ngoài kể cả `popoverRef`), `:319-331` (tự tải khi trang
  đầu không lấp đầy), `:524-540` (portal, `zIndex: 70`, `pointerEvents: "auto"`, `data-lookup-popover`).
- `erp_dev_3008` 22/09/2026: org MT 9 mục IN / 34 mục OUT, không mục nào có cha; API `:4000` đang bind `erp_dev_3008`.
- `base-crud.service.ts:333-342` `applySorting`: `orderBy(createdAt DESC)` duy nhất, không `addOrderBy`. SQL mô phỏng 5 trang × 8 trên My Company/OUT (36 dòng, 19 dòng trùng `created_at` 2026-07-09 16:11:10): `CHI_DUNG_CU_SUA_DEP` ×3, `CHI_THUE_MUON_KHAC` ×2, `CHI_VE_SINH_MOI_TRUONG` ×2 ⇒ có dòng không bao giờ xuất hiện. Picker (mergeItems khử trùng theo id) hiện 34/35.

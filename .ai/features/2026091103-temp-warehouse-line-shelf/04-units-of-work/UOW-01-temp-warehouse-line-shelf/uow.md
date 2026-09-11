---
id: UOW-01
slug: temp-warehouse-line-shelf
title: POS Kho tạm hiện kệ đã quét của từng dòng, kể cả sau Sửa → Lưu
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: revert các file của UOW; `sourceShelf` là trường thêm vào response nên POS cũ bỏ qua được; không migration
---

# UOW-01 — POS Kho tạm hiện kệ đã quét của từng dòng

API trả kệ của chính dòng (`sourceShelf`, theo `sourceLocationId`); POS dùng nó cho nhãn, cache picker và luồng
Sửa (ADR-01). Kệ hiển thị là kệ đã quét (A-02, Akenzy chốt 11/09/2026). A-01 Akenzy chốt 11/09/2026 dựa trên bằng
chứng DB local (`01-assumptions.md`); dòng prod ngày 10/09 chưa xem trực tiếp.

## Demo script

Môi trường `local-pos` (chi nhánh Hồ Chí Minh của My Company) và `local-backoffice`, DB `erp_dev_3008`.

1. Chuẩn bị: "Kho lưu trữ HCM" có kệ của phiên là **A01.02** (kệ `is_default`, không có thì kệ tạo sớm nhất);
   ABA2777-D-41 có kệ ưu tiên **A01.01**, tồn 37, đang theo dõi.
2. POS > Kho tạm, tab **"Xuất đi"**, Kho xuất "Kho lưu trữ HCM" → quét ABA2777-D-41 → "Thêm" → cột Vị trí **A01.01**.
3. Tải lại trang → vẫn **A01.01**.
4. Bấm "Sửa" dòng đó → "Lưu" không đổi gì → vẫn **A01.01**. (Trước khi sửa, bước này đổi thành A01.02.)
5. DevTools > Network: response danh sách dòng có `sourceShelf.code = "A01.01"` và `sourceLocation.code = "A01.02"`.
6. Dòng đã hỏng sẵn (chỉ trên DB local): `UPDATE temp_warehouse_lines SET notes = 'A01.02' WHERE id = '<id dòng bước 2>'`
   → tải lại → vẫn **A01.01**.
7. Ô lọc cột Vị trí: gõ `A01.01` → dòng còn; gõ `A01.02` → dòng biến mất.
8. Tab **"Trả lại"**: thêm ABA2777-D-42 → Vị trí A01.01; "Sửa" → "Lưu" → vẫn A01.01. Nếu thêm dòng "Trả lại" bị
   chặn vì tồn showroom, dùng một dòng "Trả lại" có sẵn.

## In scope

- `attachLineRelations` trả `sourceShelf`; `LineWithRelations` và `TempWarehouseLine` dùng chung thêm trường.
- POS: `locationLabelForLine`, `catalogLineFromTempWarehouseLine`, `locationFromLine`, `handleStartEdit` ưu tiên `sourceShelf`.
- Test service (jest) và test hàm thuần pos-web (vitest qua npx, A-05).

## Not in scope

- Sửa dữ liệu `notes` trên prod (A-03).
- Quy tắc chọn kệ lúc quét (`getPreferredShelf`) và kệ mà phiếu chuyển dùng.
- `use-fast-stock-transfer-data.ts`, `fast-stock-transfer-warehouse-defaults.ts` — đang được `2026091003` T-02-01 sửa.

## Risks

| Risk | Mitigation |
| --- | --- |
| A-01 sai: trên prod `source_location_id` cũng là A01.01 | A-01 đã chốt theo DB local; nếu SQL trên prod cho kết quả khác thì mở lại G2 và thêm sửa đường quét |
| Quên `pnpm build:shared` ⇒ pos-web và API không thấy `sourceShelf` | Mục riêng trong Done when của T-01-01 |
| A-04 sai: response dòng có trong OpenAPI | T-01-01 kiểm `packages/api-client/src/generated/schema.ts`, regenerate nếu có |

## Definition of done

- [x] AC-01 … AC-07 pass
- [x] `pnpm --filter @erp/api test -- temp-warehouse.service.spec.ts` xanh (mốc 35/35 cộng case mới)
- [x] `rtk proxy npx --yes vitest run src/lib/page-libs/fast-stock-transfer/` trong `apps/pos-web` xanh (mốc 14/14 cộng case mới)
- [x] `tsc --noEmit` của `apps/pos-web` sạch
- [x] Demo script chạy đầu-cuối và được nghiệm thu ở G4 — Akenzy nghiệm thu và đóng plan ngày 11/09/2026 ("oke close plan"); bước 2 và 5 không chạy đúng script (xem bảng Demo)

Trạng thái 2026-09-11:
- Spec API 37/37; `tsc --noEmit` api exit 0; `pnpm build:shared` exit 0.
- Lib `fast-stock-transfer` của pos-web 24/24 (14 cũ + 10 mới); `tsc --noEmit` pos-web exit 0.
- Chạy 10 test mới trên bản sao code trước khi sửa (`git show HEAD`, thư mục tạm đã xoá): 8 đỏ, 2 xanh. Hai test xanh là
  hai ca dự phòng không có `sourceShelf`, vốn phải giữ nguyên hành vi cũ.
- AC-01 … AC-07 có test đơn vị. AC-01, AC-02, AC-03, AC-04, AC-06 còn được kiểm trên POS (bảng dưới). AC-05 chỉ có test
  đơn vị. AC-07 có test đơn vị và bằng chứng gián tiếp trên trình duyệt: nhãn H14.03 ở bước 6 chỉ có thể đến từ `sourceShelf`,
  vì `notes` của dòng là A01.01.

### Demo 2026-09-11 (Chrome của Akenzy, POS local :3001, DB `erp_dev_3008`, tổ chức MT)

Phiên trình duyệt thuộc tổ chức MT, nên demo dùng dòng có sẵn thay cho fixture HCM. POS chỉ có nút "Sửa" ở dòng chưa cân
đối, và tự thêm dòng ngay khi chọn hàng hóa nếu đã chọn người vận chuyển.

| Bước | Chạy thay bằng | Kết quả |
| --- | --- | --- |
| 2 | Không chạy riêng cho "Xuất đi"; bước 8 có thêm một dòng "Trả lại" qua POS | — |
| 3 (AC-01) | Chi Nhánh Nha Trang, "Xuất đi", THY5567-1-K-38 (kệ A29.07), tải lại | A29.07 |
| 4 (AC-02) | "Sửa" → "Lưu lại" → tải lại | A29.07; dòng mới có `notes` A29.07 (kệ phiên A01.05) |
| 5 (AC-07) | Không đọc body response | Gián tiếp qua bước 6 |
| 6 (AC-03) | Không UPDATE DB. "Chi Nhánh cũ không dùng": MY66626-K-36 "Xuất đi" có sẵn `notes` A01.01 (ghi sai từ 12/08), kệ H14.03 | POS hiện H14.03 (`claude-chrome-screenshots-OQwVOz/screenshot-1789130922281-14.png`) |
| 7 (AC-06) | Ô lọc Vị trí của dòng THY5567-1-K-38: `A29` → dòng còn; `A01.05` → "Không có dòng cần kiểm tra." | Đúng |
| 8 (AC-04) | Nha Trang, "Trả lại", VOALC-D (kệ 999) → "Sửa" → "Lưu lại" → tải lại | 999; dòng mới có `notes` 999 |

Id dòng, request và ảnh ở T-01-03. Akenzy nghiệm thu demo và đóng plan ngày 11/09/2026, chấp nhận bước 2 và 5 không chạy
đúng như script.

---
id: UOW-05
slug: aggregate-grain-column-filters
title: Lọc theo cột hoạt động ở hạt Mẫu mã và Nhóm hàng hóa
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-05]
verifies: [AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: revert; ô lọc hiện lại ở hạt gộp và trả 400 như trước
---

# UOW-05 — Lọc theo cột hoạt động ở hạt Mẫu mã và Nhóm hàng hóa

## Demo script
1. Báo cáo > Kho > "Tổng hợp nhập xuất tồn kho", "Thống kê theo" = **Mẫu mã**, bấm Đồng ý
2. Gõ vào ô lọc cột "Mã SKU" một giá trị không tồn tại → lưới về 0 dòng
   (trước khi sửa: toast `Cột "sku" không hỗ trợ lọc trên báo cáo này`)
3. Đổi "Thống kê theo" = **Nhóm hàng hóa**, lọc cột "Nhóm hàng hóa" → lọc chạy
4. Sang "Chi tiết số lượng nhập xuất tồn kho" ở hạt Mẫu mã: các cột "Màu sắc", "Size",
   "Đơn vị tính", "Thương hiệu" đang rỗng ⇒ **không có ô lọc**; quay về hạt "Hàng hoá"
   ⇒ ô lọc của chúng hiện lại
5. `column-filterability.spec.ts` bỏ `it.failing`, cả 4 tổ hợp hạt đều xanh thật

## In scope
- Bảng "hạt nào điền cột nào" cho 4 báo cáo chưa có (`stock-summary` đã có
  `IDENTITY_KEYS_BY_GRAIN` làm khuôn)
- `filterKind` tính theo hạt trong `buildColumns`
- Spec theo hạt cho các cột nhóm A trong engine

## Not in scope
- Bỏ cột nhóm B khỏi catalog ở hạt gộp (A-09) — template cột đã lưu tham chiếu tên cột
- Hạt "Hàng hoá" và chế độ chuỗi: đã xanh từ UOW-03

## Risks
| Risk | Mitigation |
| --- | --- |
| Đánh nhầm cột nhóm A thành `none` ⇒ mất một bộ lọc đang dùng được | `probe4.py` đo cột nào có dữ liệu trên dữ liệu thật; T-05-03 kiểm hai chiều |
| Spec mới trỏ vào biểu thức SQL không tồn tại ở hạt gộp | Test bất biến chạy `buildData` thật nên bắt được ngay |

## Tiến độ đo được

91 tổ hợp cột×hạt trả 400 lúc bắt đầu → **0**. Bốn tổ hợp cuối (`total` / `branch.qty.*` của
báo cáo pivot) cần `HAVING` chứ không phải `WHERE`, nên T-05-04 gom trang/đếm/chân trang về một
CTE `groups` dùng chung — nhờ đó chân trang không bao giờ mô tả tập khác lưới nó đứng dưới.

| Bước | Còn lại |
| --- | --- |
| trước UOW-05 | 91 |
| sau T-05-01 (ẩn ô lọc cột hạt gộp để rỗng) | 35 |
| sau T-05-02 (spec định danh cho 3 engine) | 4 |
| sau T-05-04 (GROUP BY + HAVING cho cột đo của pivot) | **0** |

## Definition of done
- [x] AC-12, AC-13, AC-14 pass — bằng chứng ảnh S7, S8, S9
- [x] `column-filterability.spec.ts` không còn ngoại lệ — cả `it.failing` lẫn regex
      `KNOWN_UNFILTERABLE` đã bỏ; thêm chiều kiểm ngược (cột có dữ liệu phải GIỮ ô lọc),
      đã chứng minh nó đỏ khi cố tình ẩn cột `sku`
- [x] `pnpm --filter @erp/api test` không đỏ thêm suite nào — 305/306 xanh, suite đỏ
      duy nhất là `auth.service.spec.ts`, đã đỏ sẵn trước feature này
- [x] Demoed và accepted ở G4 — Akenzy, 2026-08-29, trên bằng chứng ảnh của
      `08-evidence.md` (7/7 bước xanh, `evidence_check` PASS)

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — AC-13 (S7),
      AC-14 (S8), AC-12 (S9); `evidence_check` báo 13/13
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
> **Không áp dụng cho feature này** — mục "PR draft copied and contact sheets attached"
> được Akenzy gỡ khỏi định nghĩa hoàn thành ngày 2026-08-29: công việc này không đi qua
> PR, và không commit nào được tạo. Bản nháp PR vẫn nằm sẵn ở cuối `08-evidence.md`, kèm
> `evidence/contact-sheet-local-backoffice.png`, dùng được ngay nếu sau này mở PR.
> Ghi lại thay vì xoá: một yêu cầu bị bỏ nên đọc được, không nên biến mất.

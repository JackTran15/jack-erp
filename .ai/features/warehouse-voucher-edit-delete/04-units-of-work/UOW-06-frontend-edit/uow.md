---
id: UOW-06
slug: frontend-edit
title: Nút Sửa hoạt động trên màn hình Nhập kho và Xuất kho
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-04]
requirements: [US-05]
verifies: [AC-19, AC-20, AC-21, AC-22]
risk: low
status: todo
rollback: Trả điều kiện `status !== "DRAFT"` về chỗ cũ trên hai thanh công cụ; backend không đổi
---

# UOW-06 — Nút Sửa hoạt động trên hai màn hình

Lát cắt làm cho toàn bộ phần backend phía trên chạm được tới người dùng thật. Đây cũng là lát
duy nhất demo được mà không cần công cụ API.

## Demo script
1. Vào Nhập kho, chọn một phiếu đã ghi sổ, bấm Sửa — form mở ra với đầy đủ dòng hàng
2. Đổi số lượng một dòng, bấm Lưu → thông báo thành công, danh sách vẫn đúng một phiếu, số phiếu không đổi
3. Mở lại phiếu: dữ liệu mới; mở sổ kho mặt hàng: có dòng chênh lệch
4. Làm y hệt trên màn hình Xuất kho
5. Thử sửa một phiếu nhập tiền mặt vượt số dư quỹ → thông báo lỗi tiếng Việt nêu đúng nguyên nhân,
   phiếu giữ nguyên
6. (AC-22 — regression T-06-05) Chọn phiếu A, bấm Sửa (dialog A mở, chưa Lưu). Trong lúc dialog
   A còn mở, chọn phiếu B trên lưới rồi bấm lại Sửa/Xem/Nhân bản → nút phải bị vô hiệu hoặc thao
   tác không có tác dụng trong khi dialog A còn mở. Đóng dialog A rồi mở lại cho B — chỉ khi đó
   mới sửa được B, và Lưu B không được đụng tới dữ liệu của A. Làm y hệt trên màn hình Xuất kho

## In scope
- Bật nút Sửa cho phiếu đã ghi sổ trên cả hai trang
- Payload PATCH đúng DTO cho phiếu nhập; nhánh lưu ở chế độ sửa cho phiếu xuất
- Sinh lại api-client và ảnh chụp OpenAPI
- Thông báo lỗi tiếng Việt và làm mới dữ liệu sau khi lưu

## Not in scope
- Hiển thị lịch sử sửa (đã bỏ theo A-13); `revision` chỉ dùng nội bộ
- Màn hình lệnh điều chuyển

## Risks
| Risk | Mitigation |
|---|---|
| Dialog phiếu xuất ở chế độ sửa đang tạo phiếu trùng | T-06-02 sửa đúng nhánh đó và có bước demo khẳng định danh sách không mọc thêm phiếu |
| Sinh lại api-client kéo theo thay đổi lớn ngoài phạm vi | Chỉ commit phần schema liên quan hai endpoint; không sửa tay file sinh tự động |
| **[2026-08-30, phát hiện QA]** `PurchaseOrderFormDialog`/`GoodsIssueFormDialog` seed state (`lines`, `providerId`, `docDate`, ...) một lần từ prop `initial` lúc mount; dialog không có `key` theo id, và 3 handler toolbar Sửa/Xem/Nhân bản không guard `dialogMode` đang mở → đổi phiếu chọn trong lúc dialog edit còn mở có thể khiến Lưu PATCH đúng id phiếu mới nhưng payload là dữ liệu phiếu cũ. Ghi nhận thực tế ở chi nhánh Vĩnh Long và Huế (~10:40–10:43). Xem AC-22 | T-06-05 |

## Definition of done
- [x] AC-19, AC-20, AC-21 pass — click-through thật qua `verify.py --write` (21/21 bước xanh,
      `evidence_check.py` OK), xem `07-verification.md` S1-S21
- [x] Sửa xong danh sách và bản in đều hiện dữ liệu mới, số phiếu không đổi — xác nhận qua
      S2-S21: số phiếu (VD IMP000012, XK000004) giữ nguyên qua nhiều lần sửa, danh sách hiện
      đúng giá trị mới sau mỗi lần Lưu
- [x] Không có phiếu trùng nào được tạo trong toàn bộ kịch bản demo — S15 (AC-20) xác nhận PATCH
      không sinh POST mới; mọi bước xoá xác nhận qua `no-text=<marker>` sau khi tải lại danh sách
- [x] `pnpm build` của backoffice-web xanh
- [x] AC-22 pass — T-06-05, done (accepted by Akenzy). Verified manually, not via `verify.py`
      (see `## Verification evidence` below for why): live click-through on `erp_dev` confirmed
      the background Sửa/Xem/Nhân bản is disabled while a document dialog is open, and a real
      Sửa+Lưu on both Nhập kho and Xuất kho produced a PATCH/DB write that touched only the
      intended voucher (`revision` incremented on the target row only) — see T-06-05's Done-when
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [ ] `verify.py <feature-dir> --write` green on every required environment — **attempted
      2026-08-30, blocked by two pre-existing issues unrelated to T-06-05, not fixed in this
      session** (user decision: stop at the manual evidence already gathered rather than chase
      this now):
      1. Several `AIDLC-VERIFY-*` fixture markers this file's S1-S21 select by text no longer
         exist/match in `erp_dev` (some renamed by this session's own manual T-06-05 testing,
         others already stale) — 12/21 steps failed on `Locator.click: Timeout … tr:has-text(...)`.
      2. `verify.py`'s `parse_interaction` fill regex (`^fill\s+(.+?)\s*=\s*(.+)$`, non-greedy)
         splits on the first `=` it finds — including the unquoted `=` inside
         `input[type="number"]`, which this file's `fill` steps use throughout. Every such step
         fails with `Unexpected token "" while parsing css selector "...input[type"`. Matches a
         limitation already noted in `reference_aidlc_verify_backoffice_session` (workaround:
         layout selectors without `=`, e.g. `input:below(:text-is("Mã SKU"))`) — this file
         predates that discovery and was never updated for it.
      Net: 1/21 passed on the 2026-08-30 attempt. No step that failed actually wrote data (the
      one fixture deliberately mutated for S14/AC-21 — `cash_accounts` balance — was restored to
      its original value, 35337395.00 / allow_negative=true, immediately after).
- [ ] Evidence exists for every AC in `verifies`, at every declared viewport — AC-22 has none via
      `verify.py` (see `07-verification.md`'s `## Not verified here` for why it's manual-only);
      AC-19–21 last had real `verify.py` evidence before 2026-08-30
- [ ] `08-evidence.md` regenerated and its commit sha matches HEAD — regenerated 2026-08-30 but
      reflects the broken run above (1/21 pass), not a clean baseline; do not treat it as current
      evidence until S1-S21 are fixed and re-run
- [ ] PR draft copied and contact sheets attached to the PR description

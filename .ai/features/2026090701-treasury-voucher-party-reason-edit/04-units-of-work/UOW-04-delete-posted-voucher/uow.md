---
id: UOW-04
slug: delete-posted-voucher
title: Xoá phiếu đã ghi sổ bằng chính bộ máy sửa
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-17, AC-18, AC-19]
risk: medium
status: todo
rollback: Trả guard delete() về `status === DRAFT` — nút Xóa xám lại như cũ
---

# UOW-04 — Xoá phiếu đã ghi sổ bằng chính bộ máy sửa

## Demo script

1. Vào Quỹ tiền › Thu chi tiền mặt, ghi lại số dư quỹ B
2. Tạo một phiếu thu 3.000.000 (mục đích Khác) → số dư B + 3.000.000
3. Chọn phiếu đó, bấm "Xóa", xác nhận
4. Số dư quỹ trở lại đúng B
5. Tải lại lưới → phiếu không còn trong danh sách
6. Kiểm tra trong DB: bản ghi vẫn còn, `deleted_at` đã có giá trị, các dòng ledger cũ vẫn nguyên vẹn
7. Mở Sổ chi tiết tiền mặt → có dòng đảo mới, không dòng cũ nào biến mất
8. Chọn một phiếu chi sinh từ Trả nợ NCC → nút "Xóa" xám

## In scope

- `delete()` = `update()` với `after = []`, dùng đúng bộ máy delta của UOW-03
- Soft-delete, giữ nguyên `status = POSTED` (ADR-02)
- Rà mọi đường đọc bằng SQL thô xem có lọc `deleted_at` không
- Mở khoá nút Xóa ở hai trang danh sách

## Not in scope

- Thêm giá trị `CANCELLED` vào enum (ADR-02 đã loại)
- Khôi phục phiếu đã xoá
- Xoá phiếu do saga sinh (A-01)

## Risks

| Risk | Mitigation |
| --- | --- |
| Đường đọc bằng SQL thô không tự lọc `deleted_at` như repository API, phiếu đã xoá vẫn hiện ở đâu đó | T-04-03 rà toàn bộ và ghi lại bảng kết quả. Đã biết trước: `search-cash-vouchers-v2.handler.ts:32` có lọc |
| Viết một đường đảo riêng cho xoá rồi lệch với đường sửa | ADR-02 buộc xoá phải gọi lại đúng hàm của UOW-03 với `after = []`, không có nhánh riêng |

## Definition of done

- [x] Cả AC-17..19 pass
- [x] `delete()` không có nhánh tính toán riêng — dùng lại hàm delta của UOW-03
- [x] Không giá trị enum mới nào được thêm (ADR-02)
- [x] Bảng rà `deleted_at` cho mọi đường đọc SQL thô đã ghi trong T-04-03
- [x] Demoed và được chấp nhận ở G4 — **chấp nhận theo bằng chứng, không phải demo trực tiếp.** Akenzy chỉ định 2026-09-07 rằng 33 test e2e + 4 ảnh `verify.py` thay được demo script. Ghi rõ để người đọc sau không hiểu nhầm: luồng chuyển tiền của UOW-03 và UOW-04 (tạo → sửa → xoá, theo dõi số dư quỹ) **chưa** được chạy trước mặt người.

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description

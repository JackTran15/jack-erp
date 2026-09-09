---
id: UOW-03
slug: edit-posted-voucher
title: Sửa phiếu đã ghi sổ bằng bút toán chênh lệch
demoable: true
duration: 2d
depends_on: []
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16]
risk: high
status: todo
rollback: Trả vị ngữ EditableVoucher về `status === DRAFT` — nút Sửa xám lại như cũ; cột revision để nguyên, vô hại
---

# UOW-03 — Sửa phiếu đã ghi sổ bằng bút toán chênh lệch

## Demo script

1. Vào Quỹ tiền › Thu chi tiền mặt, ghi lại số dư quỹ đang hiện trên đầu trang là B
2. Tạo một phiếu thu 5.000.000 (mục đích Khác) → số dư thành B + 5.000.000
3. Chọn phiếu vừa tạo, bấm "Sửa" — nút bấm được, không còn tooltip "Chỉ sửa phiếu nháp"
4. Đổi số tiền xuống 4.000.000, lưu
5. Số phiếu KHÔNG đổi; số dư quỹ về đúng B + 4.000.000
6. Mở Sổ chi tiết tiền mặt: bút toán gốc 5.000.000 còn nguyên, có thêm một dòng điều chỉnh −1.000.000 ghi chú "Adjustment for <số phiếu> rev 1"
7. Chọn một phiếu thu sinh từ POS hoặc từ Thu nợ → nút "Sửa" xám, tooltip nêu rõ là phiếu tự sinh
8. Hạ `allow_negative` của quỹ về false, thử sửa một phiếu chi lên quá số dư → báo "quỹ không đủ tiền", số dư và phiếu không đổi
9. Trên phiếu chi tiền gửi thuộc một kỳ đã khoá sổ, thử sửa → báo kỳ đã khoá

## In scope

- Nới vị ngữ sửa được từ `DRAFT` sang `MANUAL + POSTED + chưa đảo + chưa xoá`
- Bộ máy tính delta và ghi một cash/deposit movement bù trên chính phiếu
- Cột `revision` + khoá bi quan chống ghi đè đồng thời
- Kiểm kỳ khoá sổ cho phía tiền gửi
- Mở khoá nút Sửa ở hai trang danh sách, kèm guard chống lỗi PROD 30/08 bên kho

## Not in scope

- Xoá phiếu (UOW-04)
- Sửa phiếu do saga sinh (A-01)
- Đổi số phiếu, đổi quỹ nguồn, đổi loại phiếu

## Risks

| Risk | Mitigation |
| --- | --- |
| Double-post: gọi cả `createAndPostInternal` lẫn `recordMovement` cho phần chênh lệch | ADR-01 chốt đúng MỘT lời gọi `recordMovement`, không sinh phiếu thứ hai. T-03-06 kiểm bất biến Σ movement = tổng phiếu |
| Dialog seed state một lần lúc mount rồi PATCH state cũ lên id mới — đã thành bug PROD bên kho ngày 30/08 | T-03-05 bắt buộc cả hai lớp: guard `!!dialogMode` trên 3 handler toolbar VÀ `key={voucher?.id ?? "new"}` trên dialog |
| Báo cáo nào đó giả định một phiếu ↔ một movement | T-03-06 rà các đường đọc và ghi lại kết quả rà, kể cả khi không phải sửa gì |
| Tiền gửi có thêm trạng thái `PENDING_APPROVAL` mà tiền mặt không có | T-03-03 tách riêng cho phía bank thay vì ép chung một hàm |

## Definition of done

- [x] Cả AC-10..16 pass
- [x] Không câu lệnh nào UPDATE/DELETE một dòng ledger đã ghi sổ (T-03-06 chứng minh)
- [x] Vị ngữ sửa-được cưỡng chế ở service, gọi thẳng API vẫn bị chặn (ADR-05)
- [x] Không thêm permission key mới (A-09)
- [x] openapi snapshot + `packages/api-client` đã regenerate và commit (d82a6fe1)
- [x] Demoed và được chấp nhận ở G4 — **chấp nhận theo bằng chứng, không phải demo trực tiếp.** Akenzy chỉ định 2026-09-07 rằng 33 test e2e + 4 ảnh `verify.py` thay được demo script. Ghi rõ để người đọc sau không hiểu nhầm: luồng chuyển tiền của UOW-03 và UOW-04 (tạo → sửa → xoá, theo dõi số dư quỹ) **chưa** được chạy trước mặt người.

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description

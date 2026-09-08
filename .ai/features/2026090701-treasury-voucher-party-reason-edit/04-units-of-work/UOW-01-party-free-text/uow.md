---
id: UOW-01
slug: party-free-text
title: Ghi được đối tượng không có trong danh mục
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: low
status: todo
rollback: Bỏ mục "Khác" khỏi PARTNER_LOOKUP_OPTIONS — cột partner_name_snapshot vốn đã có nên không có gì phải hoàn tác ở DB
---

# UOW-01 — Ghi được đối tượng không có trong danh mục

## Demo script

1. Vào Quỹ tiền › Thu chi tiền mặt, bấm Thêm mới → Phiếu chi
2. Ở ô Loại đối tượng chọn "Khác" → ô Đối tượng mở khoá cho gõ
3. Gõ "Nguyễn Văn A", điền số tiền, lưu phiếu
4. Lưới danh sách hiện đúng "Nguyễn Văn A" ở cột Đối tượng
5. Mở lại phiếu vừa lưu → ô Đối tượng vẫn là "Nguyễn Văn A", loại vẫn là "Khác"
6. Đổi ô Loại đối tượng sang "Khách hàng" → ô Đối tượng trống lại và tra cứu danh mục
7. Mở hộp thoại Chọn đối tượng → dropdown Loại đối tượng có đủ 4 mục kể cả "Khác"
8. Lặp bước 2–5 trên phiếu thu tiền gửi để thấy cả hai module cùng hành vi

## In scope

- Đường đi trọn vẹn của một cái tên gõ tay: form → DTO → service → `partner_name_snapshot` → đọc lại → lưới
- Cả bốn loại phiếu (thu/chi × tiền mặt/tiền gửi)

## Not in scope

- Danh mục "tên tự do đã dùng" để tra cứu lại (A-06)
- Tự tạo bản ghi khách hàng/NCC từ tên gõ tay (loại ở G0)
- Gộp picker về `POST /v2/counterparties/search` (A-10)

## Risks

| Risk | Mitigation |
| --- | --- |
| Hai module có hai enum song song, dễ sửa một bên quên bên kia | T-01-01 và T-01-02 tách đôi có chủ ý, và T-01-06 kiểm cả bốn loại trong một bảng test |
| Ghi `OTHER` mà vẫn còn `partner_id` cũ sót lại từ lần chọn trước | Ràng buộc ở service: `OTHER` ⇒ `partner_id` phải NULL; AC-05 kiểm đúng đường này ở FE |

## Definition of done

- [x] Cả AC-01..06 pass
- [x] Không có migration nào được thêm cho UoW này
- [x] Ràng buộc `OTHER` ⇒ `partnerId` NULL được kiểm ở service, không chỉ ở FE
- [x] openapi snapshot + `packages/api-client` đã regenerate và commit (d82a6fe1)
- [x] Demoed và được chấp nhận ở G4 — **chấp nhận theo bằng chứng, không phải demo trực tiếp.** Akenzy chỉ định 2026-09-07 rằng 33 test e2e + 4 ảnh `verify.py` thay được demo script. Ghi rõ để người đọc sau không hiểu nhầm: luồng chuyển tiền của UOW-03 và UOW-04 (tạo → sửa → xoá, theo dõi số dư quỹ) **chưa** được chạy trước mặt người.

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description

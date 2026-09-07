---
id: UOW-02
slug: reason-autofill
title: Lý do thu/chi tự điền xuống dòng Diễn giải đầu tiên
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: Gỡ lời gọi trong handler onBlur của ô Lý do ở 4 dialog — không có thay đổi dữ liệu nào
---

# UOW-02 — Lý do thu/chi tự điền xuống dòng Diễn giải đầu tiên

## Demo script

1. Vào Quỹ tiền › Thu chi tiền mặt, bấm Thêm mới → Phiếu chi
2. Gõ "Chi tiền điện tháng 8" vào ô Lý do chi rồi rời khỏi ô
3. Ô Diễn giải dòng 1 hiện đúng câu đó
4. Lưu phiếu, mở lại → dòng 1 mang đúng nội dung đó
5. Tạo phiếu mới: gõ tay "Tiền điện chi nhánh HCM" vào Diễn giải dòng 1 TRƯỚC, rồi mới gõ ô Lý do chi
6. Diễn giải dòng 1 giữ nguyên chữ đã gõ tay, không bị đè
7. Lặp bước 2–3 trên phiếu thu tiền mặt, phiếu thu tiền gửi và phiếu chi tiền gửi

## In scope

- Quy tắc sao chép trong handler của ô Lý do ở cả bốn dialog

## Not in scope

- Điền xuống các dòng thứ 2 trở đi (loại ở G0)
- Đồng bộ hai chiều Diễn giải → Lý do

## Risks

| Risk | Mitigation |
| --- | --- |
| Dùng `useEffect` theo dõi `reason` sẽ ghi đè dòng 1 khi dialog hydrate một phiếu cũ ở chế độ sửa | ADR-04 cấm effect; T-02-02 có test riêng cho tình huống mở phiếu cũ |

## Definition of done

- [x] Cả AC-07..09 pass
- [x] Không có `useEffect` nào theo dõi `reason` được thêm vào (ADR-04)
- [x] Không file backend nào bị đụng tới
- [x] Demoed và được chấp nhận ở G4 — **chấp nhận theo bằng chứng, không phải demo trực tiếp.** Akenzy chỉ định 2026-09-07 rằng 33 test e2e + 4 ảnh `verify.py` thay được demo script. Ghi rõ để người đọc sau không hiểu nhầm: luồng chuyển tiền của UOW-03 và UOW-04 (tạo → sửa → xoá, theo dõi số dư quỹ) **chưa** được chạy trước mặt người.

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description

---
id: UOW-05
slug: leak-audit
title: Chứng minh không còn nguồn thứ 5 liệt kê nhân viên
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02, UOW-03]
requirements: [US-05]
verifies: [AC-13]
risk: low
status: todo
rollback: chỉ thêm tài liệu và test; revert không ảnh hưởng hành vi
---

# UOW-05 — Chứng minh không còn nguồn thứ 5

"check all select on ERP" trong yêu cầu gốc là một lời hứa về **độ phủ**. Một lời hứa không
kiểm chứng được thì lần sau ai đó thêm endpoint mới sẽ lặp lại đúng lỗi này.

## Demo script

1. Mở `apps/api/src/modules/rbac/employee-branch-scope.md` (mới): bảng liệt kê mọi truy vấn
   trả về danh sách nhân viên cho UI chọn, mỗi dòng ghi *đã lọc* hoặc *không cần lọc, vì …*
2. Chạy `pnpm --filter @erp/api test -- employee-listing-surfaces` — test đọc source, tìm
   mọi truy vấn trên `users` / `employee_profiles` phục vụ danh sách chọn, và fail nếu gặp
   một truy vấn không nằm trong bảng
3. Thêm tay một truy vấn giả không lọc vào một file bất kỳ → chạy lại → test **fail** (chứng
   minh test có răng), rồi bỏ ra

## In scope

- Bảng đối chiếu đặt trong repo, cạnh service, không phải trong mô tả PR
- Một test canh gác cho bảng đó

## Not in scope

- Select không liệt kê nhân viên (kho, quỹ, tài khoản tiền gửi…) — A-04

## Risks

| Risk | Mitigation |
|---|---|
| Test canh gác quét source bằng regex → giòn, fail vì đổi tên biến | Cho phép khai báo miễn trừ ngay tại file (comment `@employee-listing: <lý do>`), và bước 3 của demo bắt buộc chứng minh test có răng |
| Bảng đối chiếu lạc hậu ngay sau vài sprint | Test là thứ giữ nó đúng; nếu test bị tắt thì bảng cũng vô nghĩa — ghi rõ điều này ngay đầu tài liệu |

## Definition of done

- [ ] AC-13 pass
- [ ] Bước 3 của Demo script đã chạy thật: test fail khi cố tình thêm nguồn rò
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4

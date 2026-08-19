---
id: UOW-01
slug: admin-manage-api-keys
title: Admin creates, views and revokes named API keys with IP whitelist
demoable: true
duration: 1d
depends_on: []
requirements: [US-04, US-05]
verifies: [AC-08, AC-10]
risk: low
status: todo
rollback: bỏ import ApiKeyModule khỏi app.module.ts (không đăng ký entity nữa) — bảng vẫn còn nhưng không ai gọi tới, không mất dữ liệu
---

# UOW-01 — Admin creates, views and revokes named API keys with IP whitelist

## Demo script
1. Đăng nhập backoffice với tài khoản admin tổ chức.
2. Vào menu "API Keys" (mục mới trong sidebar).
3. Bấm "Thêm mới", đặt tên "Đối tác ABC", nhập IP whitelist `203.0.113.5, 203.0.113.0/28`,
   chọn vai trò.
4. Sau khi tạo, dialog hiện secret dạng chuỗi ngẫu nhiên — copy lại, đóng dialog.
5. Refresh trang danh sách → chỉ thấy prefix (ví dụ `a1b2c3d4***`), không còn secret đầy đủ.
6. Bấm "Thu hồi" trên dòng vừa tạo → key chuyển trạng thái đã thu hồi / biến khỏi danh
   sách hoạt động.

## In scope
- `ApiKeyEntity` + migration
- Sinh + hash secret, hiện secret một lần duy nhất lúc tạo
- CRUD qua generic platform: tạo/sửa/xem danh sách/thu hồi (soft-delete)
- Mục nav backoffice

## Not in scope
- Guard chấp nhận API key khi gọi API (UOW-02)
- Cache hoá lookup (UOW-03)

## Risks
| Risk | Mitigation |
|---|---|
| Response của `create()` phải khác các entity CRUD khác (thêm field secret một lần) | Override tại chỗ trong `ApiKeyCrudService`, không đổi `BaseCrudService` dùng chung toàn hệ thống (xem 03-logical-design.md § Contracts) |
| Tên permission `apiKey.*` phải khớp catalog thật khi seed | Đối chiếu `permissions.seed.ts` hiện có trước khi seed (T-01-03) |

## Definition of done
- [x] AC-08, AC-10 pass (e2e thật, xem T-01-05)
- [x] Secret không bao giờ log ra hoặc trả về lần thứ 2 (unit + e2e, xem T-01-03/T-01-05)
- [x] Mục nav "API Keys" xuất hiện đúng nhóm trong sidebar (T-01-04)
- [ ] Demoed and accepted at gate G4

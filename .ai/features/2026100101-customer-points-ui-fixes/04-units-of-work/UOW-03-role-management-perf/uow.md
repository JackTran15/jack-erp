---
id: UOW-03
slug: role-management-perf
title: Quản lý vai trò — bỏ ~120 request chi tiết người dùng khi tải trang
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-19, AC-20]
risk: low
status: todo
rollback: revert T-03-01..T-03-02; trường `roleIds` thêm vào response không phá client cũ
---

# UOW-03 — Hiệu năng Quản lý vai trò

## Demo script
1. DevTools → Network (Fetch/XHR), *Keep log*. Mở `/role-management`
2. Trước: ~120 dòng UUID. Sau: `/admin/roles` + 1 trang `/admin/users`, không còn `/admin/users/{uuid}`
3. Chọn *Nhân viên bán hàng* → *Danh sách người dùng* đúng như trước
4. Gán thêm một người, bỏ một người, Lưu → vào lại vai trò thấy đúng; Network không bật lại fan-out
5. Bấm *Nạp* → vẫn ≤ 3 request

## In scope
- `UserListItem.roleIds` (batch) + api-client
- `useAllUserDetails` bỏ vòng chi tiết; `useRoles` staleTime

## Not in scope
- Endpoint người dùng theo vai trò; gán hàng loạt; tối ưu `buildUserDetail`

## Risks
| Risk | Mitigation |
| --- | --- |
| Trang/picker đọc trường chỉ có ở `UserDetail` (A-10) | T-03-02 liệt kê trường trước khi code; thiếu thì `reopen` mở rộng T-03-01 |
| `roleIds` lộ vai trò người actor không được thấy | List đã lọc theo `visibleUserIds`; `roleIds` chỉ cho user đã hiện |

## Definition of done
- [x] AC-19 xanh (e2e `users-list-role-ids` 2/2)
- [x] AC-20 có ảnh Network trước (ảnh client) / sau (`summary.json`: 0 request chi tiết) + danh sách người dùng theo vai trò trong `07-verification.md`
- [x] `openapi:generate` đã chạy — không đổi gì cho `roleIds` (list trả interface, không phải DTO Swagger)

### Trước merge
- [ ] Gán thêm / gỡ người dùng khỏi vai trò qua UI rồi vào lại thấy đúng (demo bước 4) — chưa chạy vì ghi vào DB dev; logic diff `computeRoleAssignmentUpdates` không đổi
- [ ] Chấp nhận box T-03-01 "`schema.ts` có `roleIds`": không áp dụng (list `/admin/users` không có DTO Swagger)

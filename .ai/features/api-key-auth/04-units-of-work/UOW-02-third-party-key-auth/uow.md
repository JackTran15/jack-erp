---
id: UOW-02
slug: third-party-key-auth
title: Guard chấp nhận API key thay JWT, chặn theo IP whitelist + branch scope
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-09]
risk: high
status: todo
rollback: revert thay đổi ở AuthGuard/main.ts (gói gọn trong 1 guard + 1 service, không đụng route khác) — quay lại JWT-only nguyên trạng
---

# UOW-02 — Guard chấp nhận API key + IP whitelist + branch scope

## Demo script
1. Dùng key tạo ở UOW-01 (whitelist chứa IP máy demo).
2. `curl` một endpoint hiện có, không phải `@Public()` (ví dụ `GET /v1/branches`), header
   `X-Api-Key: <secret>`, không có `Authorization` → 200, dữ liệu đúng tổ chức của key.
3. Đổi sang IP không nằm trong whitelist (VPN/proxy khác) → 403.
4. Gửi key sai/không tồn tại → 401.
5. Gửi request không header nào tới cùng endpoint → 401 (không đổi so với hôm nay).
6. Gửi request không header nào tới `/health` (`@Public()`) → vẫn 200, không bị ảnh hưởng.

## In scope
- `main.ts`: `trust proxy` + Swagger `X-Api-Key`
- `ApiKeyAuthService.validate()` (chưa cache — DB trực tiếp)
- `AuthGuard` chấp nhận API key khi không có Bearer token

## Not in scope
- Cache hoá lookup (UOW-03)
- Quản lý key (UOW-01, đã xong)

## Risks
| Risk | Mitigation |
|---|---|
| Sai `TRUST_PROXY_HOPS` ở môi trường thật làm whitelist IP vô nghĩa (A-01) | Env-configurable, default 1; ghi rõ trong checklist triển khai — không thể tự kiểm chứng từ repo |
| Guard sửa sai làm hỏng nhánh JWT hiện tại | T-02-04 bắt buộc test cả nhánh JWT cũ (regression), không chỉ nhánh mới |

## Definition of done
- [x] AC-01..06, AC-09 pass (e2e thật 8/8, xem T-02-04 — AC-01 chứng minh bằng so sánh
      response body y hệt giữa API key và JWT trên cùng endpoint)
- [x] Test JWT path cũ (regression) vẫn xanh (auth.guard.spec.ts + full unit suite 276/276)
- [ ] Demoed and accepted at gate G4

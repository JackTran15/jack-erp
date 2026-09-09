---
id: UOW-07
slug: identity-cache
title: Cache roles/branches phía server, thu hồi phiên vẫn tức thì
demoable: true
duration: 2d
depends_on: []
requirements: [US-07]
verifies: [AC-23, AC-24]
risk: high
status: todo
rollback: revert commit; cache biến mất, mọi thứ trở lại đánh DB như cũ
---

# UOW-07 — Cache roles/branches phía server, thu hồi phiên vẫn tức thì

Rủi ro **cao** dù ít dòng code, vì nhầm lớp là hỏng bảo mật chứ không phải hỏng tính năng:
`resolveUserRoles` / `resolveUserBranches` không chỉ phục vụ `/auth/session`. Chúng còn chạy ở
`refresh` (`auth.service.ts:149-156`, để **đúc JWT mới**) và ở đường chuyển chi nhánh / handoff
(`:280-292`, để chặn chuyển vào chi nhánh không còn được gán). Cache những chỗ đó = cấp token
mang vai trò cũ và cho đứng ở chi nhánh vừa bị thu hồi, tối đa bằng TTL.

Phần quyền **đã** được cache sẵn (`rbac.service.ts:26-38`, TTL 300 s, có invalidate) — lát cắt này
mở rộng đúng khuôn đó sang roles + branches, không dựng cơ chế thứ hai.

## Demo script
1. Bật log truy vấn của API. Gọi `GET /auth/session` hai lần liên tiếp → lần hai không có truy vấn
   nào cho roles/branches. `GET /branches/me` hai lần → tương tự
2. Đăng xuất (thu hồi phiên) rồi gọi lại `/auth/session` bằng access token cũ → **401 ngay**,
   không chờ hết TTL
3. Đổi vai trò của tài khoản đó ở màn Phân quyền, rồi gọi lại `/auth/session` → thấy vai trò mới
   ngay, không chờ hết TTL
4. Bỏ gán một chi nhánh khỏi tài khoản → `/branches/me` không còn chi nhánh đó ngay
5. Ngưng hoạt động một chi nhánh → nó rơi khỏi `/branches/me` ngay
5b. Gỡ một chi nhánh khỏi tài khoản rồi bấm chuyển sang chi nhánh đó → **403 ngay**, không chờ
   hết TTL (đây là hồi quy mà bản 1 tạo ra)
6. Tắt Redis rồi gọi `/auth/session` → vẫn trả đúng dữ liệu (rơi về DB)

## In scope
- `getCachedIdentity(userId, orgId)` trong `AuthService`, chỉ dùng ở `getSession` (ADR-07 bản 2)
- Cache cho `BranchService.listMyBranches`
- `invalidateUserIdentity` tại các điểm đã có `invalidateUserPermissions` + đường đổi trạng thái
  chi nhánh
- e2e chứng minh thu hồi phiên và đổi vai trò vẫn tức thì

## Not in scope
- Bọc cache quanh `getSession(jti)` — cấm tuyệt đối (ADR-07)
- `buildSessionInfo` — giữ **không cache**, nhờ vậy `login`, `switchBranch`, `exchangeHandoffCode`
  đúng tự động; `refresh` và `createHandoffCode` vẫn gọi resolver trần
- Cache phía client, `Cache-Control` header
- `pos-web` (A-14 — nó gọi `/branches/me` và hưởng cache miễn phí)

## Risks
| Risk | Mitigation |
| --- | --- |
| Cache lọt vào đường đúc token hoặc cổng phân quyền | **Đã xảy ra một lần**: lượt đầu của T-07-01 cache trong `buildSessionInfo`, rò vào `login`/`switchBranch`/`exchangeHandoffCode` và biến cổng `branchIds.includes` của `switchBranch` thành quyết định đọc cache. Ticket bị trả về 8/9, ADR-07 viết lại thành bản 2. Spec chống hồi quy là bắt buộc trong T-07-01 |
| Invalidate sót một điểm → đổi vai trò 5 phút sau mới có tác dụng | T-07-03 đặt lời gọi ngay cạnh **mỗi** `invalidateUserPermissions` hiện có, và liệt kê đủ 6 điểm trong done-when |
| Redis chết → 500 thay vì rơi về DB | Dùng `CacheService.getOrSet` sẵn có, không tự viết lại; demo bước 6 kiểm đúng điều này |

## Definition of done
- [x] AC-23, AC-24 pass — `identity-cache.e2e-spec.ts`, 6/6 kịch bản, chạy hai lượt độc lập
      (T-07-04). Suite báo FAIL ở mức suite do đua `outbox_messages` có sẵn; đã đối chứng bằng một
      spec baseline sạch nên không phải test đỏ
- [x] Không có đường đúc token nào và không có cổng phân quyền nào đọc cache — `getCachedIdentity`
      chỉ được gọi từ `getSession` (`auth.service.ts:432`); `buildSessionInfo` không cache nên
      `login`/`switchBranch`/`exchangeHandoffCode` an toàn tự động; `refresh` và `createHandoffCode`
      gọi resolver trần. Kiểm bằng grep call-site, không bằng lời khai của agent
- [x] Sáu điểm invalidate hiện có đều có lời gọi tương ứng cho identity — **và bốn điểm nữa mà
      danh sách sáu điểm bỏ sót**: `setBranches`, `assignUser`, `unassignUser`, `create()` tự gán.
      Xem ghi chú cuối `T-07-03.md`
- [x] ~~Demoed và được chấp nhận ở gate G4 — chữ ký của người, không tự tick~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.

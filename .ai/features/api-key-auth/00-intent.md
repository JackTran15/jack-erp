---
feature: api-key-auth
slug: api-key-auth
owner: Akenzy
created: 2026-08-19
status: draft
---

# Intent — Xác thực API Key + IP whitelist cho đối tác thứ 3

## Problem

Hôm nay backend chỉ có **một** đường xác thực: `AuthGuard` (đăng ký toàn cục qua
`APP_GUARD` trong `common.module.ts`) kiểm tra JWT Bearer token của người dùng đã đăng
nhập. Bất kỳ hệ thống thứ 3 nào (đối tác tích hợp — sàn TMĐT, phần mềm kế toán, đối tác
logistics...) muốn gọi vào API jack-erp đều phải mượn một tài khoản người dùng thật, vì
không có hình thức xác thực nào khác dành cho server-to-server.

Cơ chế bypass duy nhất hiện có là `@Public()` (`IS_PUBLIC_KEY`) — một decorator đặt trên
handler/controller khiến `AuthGuard.canActivate` trả `true` ngay lập tức, **bỏ qua hoàn
toàn** mọi kiểm tra. Không có tầng nào khác đứng sau để bắt lại. Điều này đúng là thứ user
lo ngại: "check auth or the api it will bypass" — nếu API key được cài như một guard/route
riêng mà lập trình viên quên gắn vào một controller, endpoint đó coi như không có xác thực
gì, y hệt lỗ hổng mà `@Public()` đang tạo ra ở quy mô nhỏ (hiện chỉ 2 chỗ dùng:
`metrics.controller.ts`, `auth.controller.ts`).

Theo lựa chọn của chủ sở hữu (batch hỏi ở Phase 0b): API key phải là một **credential thay
thế JWT trên các endpoint đang tồn tại** — tức mở rộng ngay `AuthGuard` toàn cục để nó chấp
nhận HOẶC JWT Bearer HOẶC API key hợp lệ, thay vì dựng một guard/route riêng mà từng
controller phải tự nhớ gắn. Như vậy không có endpoint nào (ngoài `@Public()`) có thể "quên"
việc kiểm tra — vì chỉ có đúng một guard toàn cục, không nhân đôi bề mặt cần nhớ áp dụng.

API key còn phải mang theo whitelist IP: request kèm key hợp lệ nhưng đến từ IP không nằm
trong whitelist của key đó phải bị từ chối. Và việc kiểm tra key + IP không được biến thành
một query DB trên mỗi request — phải cache kết quả hợp lệ (Redis, theo đúng pattern
`CacheService.getOrSet` / `SessionStore` đã có sẵn trong `modules/redis/`).

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Đối tác tích hợp (hệ thống thứ 3) | Không có cách gọi API hợp lệ nếu không mượn tài khoản người dùng | Gọi các endpoint hiện có bằng header API key; được từ chối rõ ràng (401/403) nếu key sai hoặc IP không nằm trong whitelist |
| Admin tổ chức (backoffice) | Không có nơi nào tạo/xem/thu hồi API key | Tạo một hoặc nhiều key đặt tên riêng cho tổ chức mình, mỗi key có whitelist IP riêng, thu hồi được, qua màn hình admin (CRUD platform có sẵn) |
| Backend engineer | Muốn thêm xác thực thứ 2 cho một endpoint phải tự nhớ gắn guard/decorator đúng chỗ — dễ bỏ sót | Guard toàn cục đã xử lý cả JWT lẫn API key; không có gì thêm phải nhớ gắn khi viết controller mới |

## Success signal

- Một request tới **bất kỳ endpoint hiện có nào chưa đánh dấu `@Public()`**, mang header
  API key hợp lệ và IP nằm trong whitelist của key đó, được xử lý y hệt một request JWT hợp
  lệ: `request.user` được điền đủ để `Actor()` và `PermissionGuard` hoạt động bình thường,
  không cần `Authorization: Bearer`.
- Cùng key nhưng gọi từ IP ngoài whitelist → bị từ chối (403), **không** rơi vào nhánh
  "coi như JWT thiếu" (401) — hai lỗi phải phân biệt được trong response/log.
- Lần gọi thứ 2 trở đi với cùng key trong TTL cache không phát sinh thêm query DB để xác
  thực key/IP (đo bằng số lần `CacheService` hit so với miss trong test).
- 100% endpoint không phải `@Public()` đi qua đúng **một** guard toàn cục cho cả hai hình
  thức xác thực — không có controller nào tự cài thêm guard API-key riêng.

## Out of scope

- **Chiều ngược lại (jack-erp gọi ra ngoài)** — lưu trữ credential/API key của bên thứ 3 để
  jack-erp tự gọi ra là một tính năng khác (secrets management), không thuộc feature này.
- **Rate limiting / throttle theo số request mỗi phút** — "not spam backend" ở đây được xác
  nhận là **cache hoá việc kiểm tra key/IP**, không phải chặn tốc độ gọi. Nếu về sau cần
  giới hạn tần suất thật sự, đó là một feature riêng (cần thêm `@nestjs/throttler`, repo
  hiện chưa có).
- **Scope/permission riêng theo từng key** (kiểu RBAC role gắn trên key) — lựa chọn đã chốt
  là "named keys per org + admin UI", không phải "scoped keys". Mỗi key xác thực **ai đang
  gọi** (tổ chức nào), việc key đó được làm gì vẫn đi qua `PermissionGuard`/role sẵn có —
  chi tiết vai trò gán cho request API-key hoá ở G2 (ADR).
- **Một bề mặt endpoint mới dành riêng cho đối tác** (kiểu `/external/v1/...`) — đã chọn tái
  dùng endpoint hiện có, không dựng route mới.
- **Webhook (jack-erp chủ động đẩy sự kiện ra đối tác)** — không có trong yêu cầu gốc, dễ bị
  hiểu nhầm là "tích hợp bên thứ 3" nói chung; loại trừ tường minh.

## Constraints

| Kind | Detail |
|---|---|
| Hạ tầng | `main.ts` chưa có `app.set('trust proxy', ...)` — `req.ip`/`req.socket.remoteAddress` hôm nay phản ánh kết nối TCP trực tiếp, có thể là IP của reverse proxy/load balancer chứ không phải IP thật của đối tác nếu deploy sau proxy. Whitelist IP đúng nghĩa phụ thuộc vào việc này được cấu hình đúng — xem A-0x |
| Kiến trúc | `AuthGuard` là `APP_GUARD` duy nhất trong `common.module.ts`; mở rộng tại chỗ, **không** thêm một `APP_GUARD` thứ hai chạy song song (NestJS chạy tuần tự tất cả `APP_GUARD`, nhân đôi là nhân đôi bug) |
| Hợp đồng nội bộ | `Actor()` (`actor-context.decorator.ts`) đọc `request.user.{userId, organizationId, roles, branchId, branchIds}` — nhánh xác thực bằng API key phải điền đúng hình dạng này để `PermissionGuard` và mọi controller downstream không phải sửa gì |
| DB | `synchronize: false`; entity mới đi qua migration tay (`apps/api/src/database/migrations/`), PK `uuid`, soft-delete cho việc thu hồi/xoá key nếu theo `SoftDeleteEntity` |
| Admin surface | Quản lý key nên đăng ký qua generic CRUD platform (`EntityRegistryService`) như `ProviderEntity`/`SupplierGroupEntity` — không tự dựng trang backoffice riêng, trừ khi hiển thị secret key lúc tạo cần UI đặc thù (chỉ hiện 1 lần) |
| Backend source | Toàn bộ code/log/comment backend viết tiếng Anh (quy ước repo); chỉ tài liệu planning này và UI backoffice dùng tiếng Việt |
| Bảo mật | Giá trị key thô không được lưu plaintext trong DB (so sánh hash, kiểu pattern JWT secret hiện tại nhưng cho secret riêng của từng key) — chi tiết thuật toán chốt ở G2 |

## Existing surface touched

- **Guard toàn cục**: `apps/api/src/common/guards/auth.guard.ts`,
  `apps/api/src/common/common.module.ts` (`APP_GUARD` wiring)
- **Actor/permission**: `apps/api/src/common/decorators/actor-context.decorator.ts`,
  `apps/api/src/modules/rbac/permission.guard.ts`
- **Public bypass hiện có**: `apps/api/src/modules/auth/decorators/public.decorator.ts`
  (`IS_PUBLIC_KEY`) — mô hình tham chiếu cho việc guard đọc metadata qua `Reflector`
- **Cache**: `apps/api/src/modules/redis/cache.service.ts`,
  `apps/api/src/modules/redis/session.store.ts` (pattern để copy, không phải để tái dùng
  trực tiếp — namespace khác), `apps/api/src/modules/redis/redis.service.ts`
- **CRUD platform**: `apps/api/src/modules/crud/` (`EntityRegistryService`,
  `BaseCrudService`, `CrudEntityConfig`) — mô hình đăng ký entity mới để có ngay
  `/admin/entities/api-keys/records` + trang backoffice `/admin/api-keys`
- **Entity tham chiếu gần nhất**: `modules/inventory/location/` (`ProviderEntity`,
  `SupplierGroupEntity`) — entity org-scoped đăng ký qua CRUD platform, không có trang admin
  tay
- **Bootstrap**: `apps/api/src/main.ts` (CORS, versioning, Swagger `addApiKey` đã có sẵn 3
  header key khác — thêm khai báo cho API key mới nếu Swagger cần mô tả nó)
- **Module mới (dự kiến)**: chưa có `modules/api-key/` hay tương đương — sẽ là module mới,
  không phải mở rộng module có sẵn

---
feature: province-ward-lookup
blocking_open: 0
---

# Assumption register

Bốn câu hỏi được hỏi một lượt qua AskUserQuestion ngày 2026-09-18 (A-01..A-04); phần còn lại
được trả lời bằng đọc code hoặc đo trực tiếp trên hai file dump.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Người gọi là **bất kỳ principal đã xác thực** — JWT backoffice/POS/mobile hoặc `X-Api-Key` đối tác. Một bề mặt `/v2/geo/*` sau `AuthGuard` toàn cục; không `PermissionGuard`, không quyền mới, không scope theo tổ chức | high | yes | Nếu phải giới hạn đối tác: thêm `PermissionGuard` + quyền `partner.geo.read` seed cho vai đối tác, đổi prefix sang `/v2/partner/geo` — ảnh hưởng T-01-04, T-01-05, T-02-01 | resolved | Akenzy chọn "Any authenticated caller" 2026-09-18 qua AskUserQuestion |
| A-02 | Hai file dump là **nguồn**; ERP giữ bản sao đã cắt gọn trong repo và nạp bằng migration. Cập nhật = dump mới → script chuyển đổi → migration dữ liệu mới. Không gọi live sang `web_gateway` | high | yes | Nếu phải đồng bộ live: thêm HTTP client + lịch chạy + cấu hình URL/auth — UoW mới, ADR-01 đổi | resolved | Akenzy chọn "JSON dumps are the source" 2026-09-18 qua AskUserQuestion |
| A-03 | Lưu **cả hai thời kỳ** (3 321 hiện hành + 11 107 cũ), cột `is_current`; tìm kiếm mặc định chỉ trả hiện hành trừ khi `includeLegacy=true` hoặc chỉ định `provinceCode` | high | yes | Nếu chỉ cần bộ 2026: bỏ 11 107 dòng, bỏ `district_code`, bỏ `includeLegacy` — AC-07, AC-08 bị xoá | resolved | Akenzy chọn "Store both, default to current" 2026-09-18 qua AskUserQuestion |
| A-04 | **Chỉ API**: không trang backoffice, không ô chọn trên form khách hàng/chi nhánh; vẫn chạy `pnpm openapi:generate` theo quy ước repo | high | yes | Nếu cần UI: thêm UoW FE riêng (trang tự dựng vì generic CRUD không phục vụ bảng toàn cục) | resolved | Akenzy chọn "API only" 2026-09-18 qua AskUserQuestion |
| A-05 | `2026_99 Cục nhà trường` được nạp nguyên trạng (`is_active: true`, 0 phường), không lọc dòng giả | medium | no | Một migration dữ liệu xoá/tắt dòng đó; AC-01 đếm 35 đổi thành 34 | confirmed | Dump có `is_active` cho từng dòng — nguồn tự quyết dòng nào hiện; ERP không thêm luật riêng |
| A-06 | `unaccent` của Postgres ánh xạ `đ/Đ → d/D`, nên `unaccent(lower(name))` ở cả hai vế là đủ cho tìm không dấu, không cần util chuẩn hoá riêng | high | no | Thêm `replace(…, 'đ', 'd')` ở hai vế trong `GeoService`; AC-02/AC-06 vẫn giữ nguyên | confirmed | `unaccent.rules` mặc định của PG có cặp `đ d` và `Đ D`; T-01-03 kiểm lại bằng `SELECT unaccent('Đà Nẵng')` trên DB thật và ghi kết quả |
| A-07 | Mã phường/xã duy nhất trong từng thời kỳ, nên `GET /v2/geo/wards/:code` không kèm `provinceCode` tra bộ hiện hành là không mơ hồ | high | no | Script chuyển đổi fail non-zero khi dump mới vi phạm; endpoint sẽ phải bắt buộc `provinceCode` | confirmed | Đo trên dump 2026-09-18: 0 mã trùng trong 3 321 dòng 2026, 0 trong 11 107 dòng 1995; unique `(province_code, code)` toàn bộ. Sau review: script chuyển đổi **fail** khi có mã trùng trong bộ hiện hành; `findWard` thêm ORDER BY + LIMIT 1 |
| A-08 | Versioning `@Version('2')` theo method và envelope `{ data, total, page, limit }` theo bề mặt partner/mobile, không dùng `pageSize` của `shared-interfaces` | high | no | Đổi tên hai field DTO + e2e | confirmed | `partner-product-search.dto.ts:199-211`, `mobile-*-list.query.dto.ts` đều dùng `page`/`limit` |
| A-09 | Migration luôn chạy qua ts-node từ `src`, nên file JSON đặt cạnh migration đọc bằng `readFileSync(__dirname…)` là đủ, không cần thêm `assets` vào `nest-cli.json` | high | no | Thêm `database/migrations/data/**` vào `assets` của `nest-cli.json` — một dòng | confirmed | `apps/api/package.json:16` `typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts`; e2e `global-setup.ts:110` gọi đúng script đó; `data-source.ts` không bật `migrationsRun` |
| A-10 | Không client nào (backoffice, pos-web, mobile) được nối vào trong feature này; thay đổi phía client chỉ là `@erp/api-client` sinh lại | high | no | — | confirmed | A-04 |
| A-11 | `district_code` của phường cũ lưu dạng chuỗi thô; không có bảng quận/huyện | high | no | Entity mới sau này | confirmed | Dump không có tên huyện, chỉ có mã |
| A-12 | Tên: module `modules/geo`, route `/v2/geo`, bảng `geo_provinces` / `geo_wards`, tag Swagger `Geo` | high | no | Đổi tên trước T-01-04 | confirmed | Không trùng với `inventory/location` (kho) hay `branch` |
| A-13 | Không thêm rate limit riêng; API key đã có IP whitelist | high | no | Thêm throttler lên controller | confirmed | `api-key-auth.service.ts:56-68` kiểm IP trên mỗi request |
| A-14 | Phường hiện hành có `district_code: ''` trong dump → lưu `NULL`; mã phường giữ nguyên chuỗi (không đệm/không bỏ số 0) | high | no | Nếu cần chuẩn hoá mã: đổi ở script chuyển đổi, nạp lại bằng migration mới | confirmed | Đo trên dump: 3 321 dòng 2026 đều `district_code === ''`; mã `4`, `70`, `25` (2026) vs `001`, `004` (1995) |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|-----------------|-----------------------|-------------|
| — | (chưa có) | | |

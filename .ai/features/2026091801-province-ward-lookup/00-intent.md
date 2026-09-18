---
feature: province-ward-lookup
slug: 2026091801-province-ward-lookup
owner: Akenzy
created: 2026-09-18
status: draft
---

# Intent — Tra cứu tỉnh/thành và phường/xã

## Problem

ERP không có dữ liệu đơn vị hành chính. Mọi địa chỉ trong hệ thống là chuỗi tự do:
`customers.address` (`customer.entity.ts:33`), `branches.address` (`branch.entity.ts:32`),
`providers.address` / `contactAddress` (`provider.entity.ts:42,91`), `partner_address_snapshot`
trên bốn loại phiếu thu/chi; chỉ `employee_addresses` có cột `province` / `district` / `ward`
(`employee-address.entity.ts:20-33`) và cũng là varchar nhập tay. Không có bảng, không có
endpoint, không có kiểu dùng chung nào cho tỉnh/thành hay phường/xã (grep `province|ward`
trên `apps/api/src`, hai SPA và `packages/shared-interfaces`: 0 kết quả ngoài HR).

Hệ quả: bất kỳ client nào — backoffice, POS, app mobile, hay đối tác gọi bằng API key —
muốn có ô chọn tỉnh/thành, phường/xã, hoặc chuẩn hoá địa chỉ, đều phải tự mang bộ dữ liệu
riêng và tự cập nhật sau đợt sáp nhập 2025. Mỗi client một bản là ba bản lệch nhau.

Nguồn dữ liệu đã có: hai bản dump Mongo từ database `web_gateway`
(`web_gateway.provinces.json`, `web_gateway.wards.json`, đang nằm untracked ở gốc repo):

| Bộ | Số dòng | Ghi chú |
|---|---|---|
| Tỉnh/thành | 35 | tất cả mã `2026_xx`, `is_active: true`, mỗi dòng có `merged_from[]` là các mã `1995_xx` đã gộp vào; `2026_99 Cục nhà trường` là dòng giả, 0 phường |
| Phường/xã hiện hành | 3 321 | `province_code` = `2026_xx`, `district_code` = `''` (không còn cấp huyện), mã không đệm số 0 (`4`, `70`) |
| Phường/xã cũ (trước sáp nhập) | 11 107 | `province_code` = `1995_xx`, có `district_code`, mã đệm số 0 (`001`) |

Mã phường/xã **chỉ duy nhất trong từng thời kỳ** (0 trùng trong bộ 2026, 0 trùng trong bộ 1995)
và duy nhất theo cặp `(province_code, code)`; trùng chéo hai thời kỳ 3 288 lần — nên mã phường
không được coi là khoá toàn cục.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Đối tác storefront (API key) | Không có nguồn tỉnh/phường nào từ ERP; tự nhúng danh sách | `GET /v2/geo/provinces`, `GET /v2/geo/wards?q=` bằng chính key đang dùng, không cần quyền thêm |
| App mobile / backoffice / POS (JWT) | Địa chỉ gõ tay | Cùng endpoint, cùng dữ liệu — làm ô chọn khi cần ở feature sau |
| Người vận hành ERP | Không có gì để cập nhật | Cập nhật bằng một dump mới → script chuyển đổi → một migration dữ liệu mới |

## Success signal

Trên DB mới chạy `pnpm migration:run` xong, cả JWT backoffice lẫn API key đối tác (không cần
`X-Branch-Id`) đều gọi được `GET /v2/geo/provinces?q=ha noi` ra "Hà Nội" và
`GET /v2/geo/wards?provinceCode=2026_01` ra đúng 126 phường hiện hành của Hà Nội; e2e
`geo.e2e-spec.ts` xanh toàn bộ AC-01..AC-12.

## Out of scope

- Ô chọn tỉnh/phường trên form khách hàng, chi nhánh, nhà cung cấp — không đổi cột địa chỉ
  nào hiện có (Akenzy chọn "API only", 2026-09-18).
- Trang backoffice liệt kê tỉnh/phường — bảng toàn cục không đi qua generic CRUD
  (`base-crud.service.ts:279-297` luôn AND `organizationId`), nên là trang tự dựng; để sau.
- Gọi live sang dịch vụ `web_gateway` để đồng bộ — dump là nguồn, ERP giữ bản sao.
- Bảng quận/huyện — dump không có tên huyện, chỉ có `district_code` ở phường cũ; giữ mã thô.
- Endpoint ghi/sửa — dữ liệu tham chiếu chỉ thay bằng migration.

## Constraints

| Kind | Detail |
|---|---|
| Auth | Chỉ `AuthGuard` toàn cục (JWT hoặc `X-Api-Key`, `auth.guard.ts:43-109`); không `@Public()`, không `PermissionGuard`, không quyền mới — dữ liệu công khai, không thuộc tổ chức nào |
| Platform | `ValidationPipe` toàn cục `forbidNonWhitelisted: true` — DTO là hợp đồng; `@Version('2')` theo method như `partner-catalog` |
| Test | e2e `resetDatabase()` chạy `synchronize(true)` (`test-app.ts:85-113`) → dữ liệu nạp bằng migration biến mất; loader phải là hàm gọi lại được từ `beforeAll`, và entity phải khai đủ index/unique để `synchronize` khớp migration |
| Data | Migration chạy bằng ts-node từ `src` ở mọi môi trường (`typeorm-ts-node-commonjs -d src/database/data-source.ts`; e2e `global-setup.ts:110`); glob chỉ `migrations/*.{ts,js}` nên thư mục `migrations/data/` không bị nhận nhầm là migration |
| Repo | Sau khi đổi endpoint phải chạy `pnpm openapi:generate` và commit snapshot + `schema.ts` sinh ra |

## Existing surface touched

- Reused: `AuthGuard` (JWT + API key), `escapeLikeTerm` (`common/utils/like-escape.util.ts:20`),
  extension `unaccent` (`1782500000000-AddUnaccentExtension.ts`), mẫu bảng toàn cục
  `report_types` (`reporting/invoice-report/report-type.entity.ts`), mẫu controller v2 + Swagger
  `@ApiSecurity('api-key')` (`partner-catalog/controllers/partner-product-v2.controller.ts`),
  cách mint API key trong e2e (`partner-catalog.e2e-spec.ts:336-367`).
- Adjacent: `api-key-auth`, `2026090903-partner-catalog-api` (cùng bề mặt đối tác).
- Entry points: module mới `apps/api/src/modules/geo/` đăng ký trong `app.module.ts`;
  4 route `GET /v2/geo/provinces`, `/provinces/:code`, `/wards`, `/wards/:code`.

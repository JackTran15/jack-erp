---
id: UOW-01
slug: partner-category-tree
title: Đối tác lấy được cây nhóm hàng hoá bằng API key
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-21, AC-22]
risk: low
status: todo
rollback: Gỡ `PartnerCatalogModule` khỏi `app.module.ts` — route biến mất, không dữ liệu nào đổi (bề mặt chỉ đọc, không migration)
---

# UOW-01 — Đối tác lấy được cây nhóm hàng hoá bằng API key

## Demo script
1. Cấp một API key mới ở backoffice `/admin/api-keys`, gán role "Đối tác", whitelist IP máy demo
2. `curl -X POST http://localhost:4100/v2/partner/catalog/categories/tree -H "X-Api-Key: <key>" -H "Content-Type: application/json" -d "{}"` → trả cây nhóm lồng nhau
3. Chỉ ra "GIÀY DÉP" có `productCount` > 0 dù bản thân nó không có hàng gắn trực tiếp
4. Gọi lại nhưng bỏ header `X-Api-Key` → 401
5. Đổi sang một key có role khác (không có `partner.catalog.read`) → 403
6. Mở `/docs`, chỉ ra endpoint có schema response đầy đủ và khai `X-Api-Key`

## In scope
- Module `partner-catalog`, quyền `partner.catalog.read`, role "Đối tác"
- Endpoint cây nhóm hàng chạy end-to-end bằng API key thật

## Not in scope
- Tìm sản phẩm (UOW-02)
- Lọc theo giá/màu/size (UOW-03)
- Chi tiết sản phẩm (UOW-04)

## Risks

| Risk | Mitigation |
|---|---|
| Quyền mới chảy tự động vào SYSTEM_ADMIN và GENERAL_MANAGER qua `ALL_PERMISSION_KEYS` | Đúng ý muốn, nhưng T-01-02 phải chạy lại `org-role-permissions.spec.ts` và cập nhật kỳ vọng |
| e2e boot ~215s và hook 60s đỏ sẵn kể cả với spec cũ | Đọc output test thật thay vì exit code — đã ghi trong ghi chú T-01-04 |

## Definition of done

- [x] AC-01..04, AC-21, AC-22 pass — e2e `partner-catalog.e2e-spec.ts` 38/38 (2026-09-13, `OUTBOX_RELAY_DISABLED=1`): nhóm category tree, cùng 401/403 ở cả 3 endpoint
- [x] Demo chạy bằng một API key thật, không phải JWT — gói cURL chạy 37/37 qua HTTP bằng API key thật (không JWT) trên build `:4200`, gồm `10-tree-01..04`; `07-performance.md` cũng đo bằng API key thật cho cả 2 tổ chức
- [x] Không endpoint nào của module gắn `@Public()` — grep `@Public` trong `modules/partner-catalog` chỉ ra 2 dòng comment nói *không* gắn; e2e trả 401 khi thiếu credential ở cả 3 endpoint
- [x] `pnpm --filter @erp/api test` xanh cho các spec của module — `pnpm --filter @erp/api test -- partner-catalog` 172/172, 10 suite (2026-09-13); `partner-catalog.module.spec.ts` đỏ từ 27b6f406 và được sửa trong T-04-03
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp

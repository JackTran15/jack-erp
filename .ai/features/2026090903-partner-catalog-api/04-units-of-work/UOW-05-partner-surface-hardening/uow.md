---
id: UOW-05
slug: partner-surface-hardening
title: Bề mặt đối tác không lộ dữ liệu nội bộ và có tài liệu
demoable: true
duration: 1d
depends_on: [UOW-04]
requirements: [US-04]
verifies: [AC-19, AC-20, AC-21, AC-22]
risk: medium
status: todo
rollback: Test là bổ sung thuần, gỡ ra không đổi hành vi chạy. Việc sinh lại api-client revert được bằng git
---

# UOW-05 — Bề mặt đối tác không lộ dữ liệu nội bộ và có tài liệu

## Demo script
1. Chạy `pnpm --filter @erp/api test partner-catalog-contract` → xanh
2. Thêm tạm `purchasePrice` vào một DTO đối tác, chạy lại → **đỏ**; bỏ ra, chạy lại → xanh
3. Chạy e2e: key role "Đối tác" nhận 403 từ `/v2/inventory-items/search` và từ `/inventory/items/products`
4. Cùng key đó nhận 200 từ `/v2/partner/catalog/products/search`
5. Mở `/docs`, chỉ ra cả 3 endpoint có schema response và khai `X-Api-Key`
6. Chỉ ra 3 endpoint trong `packages/api-client/src/generated/schema.ts` với kiểu cụ thể, không phải `unknown`

## In scope
- Test hợp đồng chặn rò trường nội bộ
- e2e chứng minh ranh giới quyền
- Sinh lại OpenAPI client + commit snapshot

## Not in scope
- Gỡ `purchasePrice` khỏi DTO nội bộ — ADR-02 loại tường minh vì sẽ lan sang backoffice
- Rate limiting theo tần suất
- Tài liệu tích hợp viết riêng cho đối tác đọc (ngoài OpenAPI)

## Risks

| Risk | Mitigation |
|---|---|
| Snapshot OpenAPI sinh từ API đang chạy bởi checkout khác sẽ có diff phình ra chỗ không liên quan | T-05-03 bắt buộc dựng cổng riêng và kiểm phạm vi diff |
| Test hợp đồng viết lỏng sẽ xanh cả khi trường mới lọt ra | T-05-01 yêu cầu chứng minh test đỏ được, bằng cách thử thêm `purchasePrice` rồi bỏ ra |

## Definition of done

- [x] AC-19, AC-20 pass; AC-21 và AC-22 được kiểm lại ở mức e2e trên cả 3 endpoint — `partner-catalog-contract.spec.ts` trong `pnpm --filter @erp/api test -- partner-catalog` 172/172, 10 suite (2026-09-13); e2e `partner-catalog.e2e-spec.ts` 38/38 (2026-09-13, `OUTBOX_RELAY_DISABLED=1`): nhóm permission boundary (T-05-02) và 401/403 ở tree, search, detail
- [x] Test hợp đồng đã được chứng minh là đỏ khi thêm trường giá vốn — T-05-01 "Chứng minh test thật sự đỏ (2026-09-09)": `purchasePrice?` → `✕ does not declare purchasePrice`
- [x] `schema.ts` và `openapi.snapshot.json` đã commit, diff đúng phạm vi — commit `e1e4a932` trên nhánh `feat/partner-catalog-filters-detail-by-code`; phần partner đúng 3 endpoint, phần drift còn lại truy được về mã đã merge trước đó (xem T-05-03)
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp

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

- [ ] AC-19, AC-20 pass; AC-21 và AC-22 được kiểm lại ở mức e2e trên cả 3 endpoint
- [ ] Test hợp đồng đã được chứng minh là đỏ khi thêm trường giá vốn
- [ ] `schema.ts` và `openapi.snapshot.json` đã commit, diff đúng phạm vi
- [ ] Demo và nghiệm thu tại gate G4

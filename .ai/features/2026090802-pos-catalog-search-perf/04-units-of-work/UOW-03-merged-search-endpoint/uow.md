---
id: UOW-03
slug: merged-search-endpoint
title: Endpoint gộp GET /catalog/search trả { exact, suggestions }
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-01, US-02]
verifies: [AC-04, AC-06]
risk: medium
status: todo
rollback: gỡ controller khỏi `pos.module.ts` — endpoint biến mất, hai endpoint cũ vẫn nguyên, FE chưa dùng tới
---

# UOW-03 — Endpoint gộp `/catalog/search`

## Demo script
1. `curl -s '…/pos/branches/<id>/catalog/search?q=235&view=suggest&limit=20' | wc -c`
   → so với `curl -s '…/catalog?search=235' | wc -c`.
2. `curl '…/catalog/search?q=<mã vạch có thật>&mode=exact'` → `exact` là object, `suggestions` rỗng.
3. `curl '…/catalog/search?q=<mã không tồn tại>&mode=exact'` → `exact: null`.
4. `curl '…/catalog/search?q=235&limit=5000'` → 200, đúng 100 phần tử (kẹp trần, không 400).
5. Mở `/docs` → endpoint mới hiện đủ schema response (không rỗng — bẫy đã dính ở
   [[project_pos_invoice_list_customer_layout]]).

## In scope
- DTO query + response, Query + Handler CQRS, controller v2, wiring module.
- Regenerate `@erp/api-client`.

## Not in scope
- FE (UOW-04). Endpoint này ra đời nhưng chưa ai gọi — đó là điều kiện để rollback
  của UoW này chỉ là gỡ một dòng khỏi module.

## Risks
| Risk | Mitigation |
|---|---|
| Controller v2 khai `@ApiOkResponse` thiếu `type` → schema response rỗng trong OpenAPI, `api-client` sinh ra `unknown` | Done-when kiểm `/docs-json` có schema đầy đủ. Đã dính đúng bẫy này ở [[project_pos_invoice_list_customer_layout]] |
| `getBranchDelta` (kho tạm) chạy hai lần nếu cả hai nhánh cùng gọi | Handler gọi đúng một lần rồi truyền vào cả hai nhánh — A-09 |
| Route `/:branchId/catalog/search` bị route `/:branchId/catalog/products/:id` nuốt do thứ tự đăng ký | Controller riêng, path khác nhánh; done-when có curl chứng minh. Tiền lệ route-order ở [[project_deposit_fund_epics]] |

## Definition of done
- [x] AC-04, AC-06 pass
- [x] `/docs-json` chứa schema đầy đủ cho response (không `unknown`, không rỗng)
- [x] `pnpm openapi:generate` chạy, `openapi.snapshot.json` + `schema.ts` được commit
- [x] Handler spec xanh, phủ `mode`, `view`, kẹp `limit`, và ca `exact` >1 khớp → null
- [x] Demoed và accepted ở G4

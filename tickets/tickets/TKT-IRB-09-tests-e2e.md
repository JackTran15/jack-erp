# TKT-IRB-09 Tests + E2E + DoD gate

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Cổng chất lượng cuối: hoàn thiện unit specs cho mọi handler (query + command), thêm spec đối chiếu registry **cố định** ⟷ nhãn VI, và E2E round-trip chạy trên `erp_test` (catalog cố định+động → search aggregate theo ngày nhiều tổ hợp cột/scope → template create/list/get/update/delete). Chốt Definition of Done của epic.

## Deliverables

- Unit (nếu chưa đủ ở TKT-03/04/05):
  - `get-invoice-report-columns.handler.spec.ts` — catalog cố định đầy đủ + cột động từ payment-account mock (đúng band + name=label); không lộ metadata; scope org.
  - `invoice-report.columns.spec.ts` — `isKnownSummaryColumn`/`isDynamicColumnKey`/`parseDynamicColumnKey`.
  - `search-invoice-report.handler.spec.ts` — reject cột lạ (cố định + uuid không thuộc org); 400 thiếu `issuedAt`; gom đúng theo ngày (số dòng = số ngày); sum cố định + pivot payment-account đúng; computed (`revenue.total`/`actualRevenue`/`revenue.promoRate`) đúng công thức; scope org; consolidated vs branch (+403); `totals`; cell `{col,type,value}`; envelope `{headers,dataRaw,totals,total,page,limit}`.
  - template handlers spec — create (happy/validate cố định+động/unique 409), update (404/validate), delete (soft), list (order/scope), get (404 cross-tenant).
- `apps/api/test/.../invoice-report.spec.ts` — **đối chiếu**: mọi key cố định trong `INVOICE_REPORT_SUMMARY_COLUMNS` có entry trong `INVOICE_REPORT_COLUMN_LABELS_VI` và ngược lại (không lệch; key động không nằm trong labels).
- E2E `apps/api/test/e2e/invoice-report.e2e-spec.ts`:
  - Seed: 1 org, 2 branch, vài `payment_accounts` (active), invoice ở **2 ngày khác nhau** kèm `invoice_payments` trỏ các payment-account.
  - Catalog: `GET /reports/invoices/columns` → 200, **chỉ** `{ headers }` (không kèm dữ liệu); đủ cột cố định + một cặp cột động / một payment-account active của scope.
  - Search aggregate: chọn `date` + vài cột → response **chỉ** `{ dataRaw, totals, total, page, limit }` (**không** `headers`); **một dòng / một ngày** trong khoảng; tổng cố định đúng; `totals` = tổng 2 ngày.
  - Search cột động: chọn `payment.method.<id>` → mỗi ngày = tổng tiền theo payment-account đó; account khác không lẫn.
  - Search per-column filter: `columnFilters:[{col:'revenue.goods',lte:N}]` → chỉ còn ngày thỏa; `totals` tính lại trên tập đã lọc; áp được cả cột computed/động.
  - Search branch-scope: user chỉ-branch → chỉ ngày/hóa đơn branch mình; yêu cầu branch khác → 403.
  - Search consolidated: user consolidated, `branchId` rỗng → gom cả 2 branch.
  - Thiếu `issuedAt` → 400; cột lạ trong `columns` **hoặc** `columnFilters[].col` (key cố định lạ / uuid payment-account không thuộc org) → 400.
  - Template: create → list (thấy) → get → update (đổi cột/filter) → search dùng cột của template → delete (list không còn); tạo trùng tên → 409; tạo lại sau xóa → OK.

## Acceptance Criteria

- [ ] Toàn bộ spec xanh: `pnpm --filter @erp/api test` và `pnpm --filter @erp/api test:e2e`.
- [ ] E2E xác nhận **không rò chéo tenant/branch** và scope consolidated đúng.
- [ ] Spec đối chiếu registry⟷label fail nếu thêm cột mà quên label (chống drift).
- [ ] Idempotency: replay create template cùng `X-Idempotency-Key` → REPLAYED (không tạo 2 bản).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` xanh (đọc output thật, không chỉ exit code — e2e Kafka teardown có thể treo, xem CLAUDE.md).
- [ ] `openapi.snapshot.json` + `schema.ts` đã commit (TKT-06); không hand-edit.
- [ ] No Vietnamese trong backend source (chỉ label ở shared package).
- [ ] No schema change ngoài migration TKT-01; `synchronize` false.
- [ ] FE build/typecheck xanh; verify trực quan trang đã làm (TKT-08).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

- E2E dùng setup `erp_test` sẵn có (`global-setup.ts` auto-create DB + migrate); chạy serial (`maxWorkers:1`, `forceExit`).
- Seed gọn qua repository trực tiếp trong test (giống e2e hiện có), hoặc tái dùng seed helper nếu có.
- Assert aggregate + pivot: tạo invoice ở 2 ngày, mỗi invoice có payment trỏ payment-account khác nhau → kỳ vọng `dataRaw.length === 2` (2 ngày), cột `payment.method.<id>` mỗi ngày = tổng đúng theo account, `totals` = tổng 2 ngày.

## Testing Strategy

- Unit: mock repo/qb + `RbacService`.
- E2E: HTTP thật qua `supertest` (pattern e2e hiện có), DB thật `erp_test`.

## Dependencies

- Depends on: [TKT-IRB-04](./TKT-IRB-04-be-cqrs-report-search.md), [TKT-IRB-05](./TKT-IRB-05-be-template-cqrs-crud.md), [TKT-IRB-06](./TKT-IRB-06-be-permissions-openapi.md), [TKT-IRB-08](./TKT-IRB-08-fe-report-page.md).
- Blocks: — (cổng cuối epic).

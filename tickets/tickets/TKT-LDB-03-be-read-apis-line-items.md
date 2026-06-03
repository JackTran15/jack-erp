# TKT-LDB-03 BE: Attach line items to posted/returnable/purchase-history search + verify reads + openapi

## Epic

[EPIC-03062026 POS per-line discount breakdown + line note in read APIs](../epics/EPIC-03062026-pos-line-discount-breakdown.md)

## Summary

Đảm bảo **mọi** API đọc hóa đơn liên quan trả về line items kèm breakdown KM dòng + `note`. Ba đường đọc đã có items (chỉ cần verify cột mới tự lộ); **ba** V2 search handler posted hiện chỉ trả header — gắn thêm `items[]` theo đúng pattern của `SearchDraftInvoicesV2Handler`. Cuối cùng regenerate api-client snapshot.

## Hiện trạng (đã map)

| Đường đọc | File | Items hôm nay |
| --------- | ---- | ------------- |
| `GET /invoices/:id` (`findOneWithItems`) | `services/invoice.service.ts:224` | ✅ có (verify cột mới) |
| `GET /invoices/drafts` (`findDrafts`) | `controllers/invoice.controller.ts:99` | ✅ có (verify) |
| `POST /v2/invoices/drafts/search` | `queries/search-draft-invoices-v2.handler.ts:70` | ✅ có (verify) |
| `POST /v2/invoices/search` | `queries/search-invoices-v2.handler.ts` | ❌ **gắn items** |
| `POST /v2/invoices/returnable/search` | `queries/search-returnable-invoices-v2.handler.ts` | ❌ **gắn items** |
| `POST /v2/invoices/purchase-history/search` | `queries/search-purchase-history-v2.handler.ts` | ❌ **gắn items** |

## Deliverables

- `apps/api/src/modules/pos/queries/search-invoices-v2.handler.ts` — inject `InvoiceItemEntity` repo, gắn `items[]` per row sau `getManyAndCount()`.
- `apps/api/src/modules/pos/queries/search-returnable-invoices-v2.handler.ts` — gắn `items[]`.
- `apps/api/src/modules/pos/queries/search-purchase-history-v2.handler.ts` — gắn `items[]`.
- `apps/api/src/modules/pos/pos.module.ts` — đảm bảo `TypeOrmModule.forFeature` đã có `InvoiceItemEntity` cho 3 handler (draft handler đã inject `itemRepo` → pattern sẵn có).
- (Verify, không nhất thiết đổi code) `dto/draft-invoice.response.dto.ts` — `DraftInvoiceItemDto extends InvoiceItemEntity` nên 4 cột mới + `note` tự xuất hiện trong Swagger/response của detail + draft.
- Snapshot: `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (regenerate, không sửa tay).

## Acceptance Criteria

- [ ] Ba handler posted trả mỗi row kèm `items: InvoiceItemEntity[]` (mảng rỗng nếu không có), **sort `sortOrder ASC`**, nạp bằng 1 query `In(invoiceIds)` (không N+1 per row) — mirror `SearchDraftInvoicesV2Handler` (dòng 70–87).
- [ ] Mỗi line item trả về có đủ: `lineDiscount`, `lineDiscountType`, `lineDiscountValue`, `lineDiscountReason`, `note` (cùng các cột snapshot sẵn có).
- [ ] Items được scope theo cùng `organizationId` (+ `branchId` nơi handler đang scope) — không rò chéo tenant; chỉ nạp items của các `invoiceId` đã qua bộ lọc/scope của handler.
- [ ] `findOneWithItems` (detail posted) và draft/`findDrafts` không cần sửa logic; verify response chứa 4 cột mới + `note`.
- [ ] `POST /v2/invoices/search` chỉ **thêm** `items[]` (additive) — các field header cũ và phân trang không đổi; không phá `InvoiceListPage` (consumer bỏ qua field thừa).
- [ ] Resolve quan hệ bằng inline vào từng row (`row.items = [...]`), KHÔNG trả root `{[invoiceId]: items}` map.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass; handler specs cập nhật ở TKT-LDB-04.
- [ ] Chạy API, `pnpm openapi:generate`; commit `openapi.snapshot.json` + generated `schema.ts` (không sửa tay).
- [ ] Không đổi schema; `synchronize` false. Không Vietnamese trong source backend.

## Tech Approach

Mirror nguyên pattern attach của draft handler cho từng handler posted (sau khi đã có `data` + `total`):

```ts
// constructor: @InjectRepository(InvoiceItemEntity) private readonly itemRepo: Repository<InvoiceItemEntity>
if (data.length > 0) {
  const items = await this.itemRepo.find({
    where: { invoiceId: In(data.map((d) => d.id)) },
    order: { sortOrder: 'ASC' },
  });
  const byInvoice = new Map<string, InvoiceItemEntity[]>();
  for (const item of items) {
    const bucket = byInvoice.get(item.invoiceId) ?? [];
    bucket.push(item);
    byInvoice.set(item.invoiceId, bucket);
  }
  for (const row of data) {
    (row as InvoiceEntity & { items: InvoiceItemEntity[] }).items =
      byInvoice.get(row.id) ?? [];
  }
}
```

> `In` import từ `typeorm`. `itemRepo` đã chỉ nạp items của các invoiceId nằm trong `data` — vốn đã được handler scope org/branch — nên không cần thêm điều kiện tenant, nhưng có thể thêm `organizationId: actor.organizationId` cho chắc. Trên list endpoint, chi phí = 1 query phụ/ trang (≤ limit invoices); chấp nhận theo decision của epic.

## Testing Strategy

- Handler specs (TKT-LDB-04 mở rộng các spec đã có): seed hóa đơn có line item mang breakdown; assert mỗi row có `items[]` đúng thứ tự `sortOrder`, có đủ field mới + `note`, không rò tenant.
- Manual: gọi 3 endpoint qua `/docs`, xác nhận payload có `items[]` + breakdown.

## Dependencies

- Depends on: TKT-LDB-01 (cột entity để lộ), TKT-LDB-02 (để có dữ liệu breakdown ghi vào). Đọc-only nên có thể implement song song TKT-LDB-02, nhưng assert dữ liệu cần TKT-LDB-02.
- Blocks: TKT-LDB-04 (E2E round-trip dựa trên các endpoint này).

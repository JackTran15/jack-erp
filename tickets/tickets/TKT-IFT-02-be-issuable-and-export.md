# TKT-IFT-02 BE: issuable picker query + export nhận dòng đã sửa + gắn reference

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟦 Backend only (service + controller + DTO). **KHÔNG migration** — cột `goods_issues.reference_id`/`reference_type`/`target_branch_id` đã có sẵn.

## Summary

Hai thay đổi nhỏ trên module `transfer-order` của EPIC-07062026:

1. **Picker query** `GET /inventory/transfer-orders/issuable` — liệt kê lệnh `DRAFT` mà `actor.branchId` là **kho nguồn**, lọc khoảng ngày, inline `destinationBranchName`.
2. **Export nhận dòng đã sửa** — `confirmExport(id, actor, dto?)` + `POST /:id/export` nhận body tùy chọn `ExportTransferOrderDto`; khi có `lines` thì dùng dòng người dùng đã sửa thay cho derive mặc định, và **gắn `referenceType=TRANSFER_ORDER` + `referenceId=order.id`** lên GoodsIssue spawn ra (để "Tham chiếu LDC…" hiển thị). Không body → giữ nguyên hành vi derive cũ (tương thích nút export `TransferOrdersPage`).

## Deliverables

- `apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts`:
  - `listIssuable(query, actor)` — repo query: `organizationId=actor.organizationId`, `sourceBranchId=actor.branchId`, `status=DRAFT`, `requestedDate` (fallback `createdAt`) ∈ `[from, to]`; join `branches` lấy tên đích; map → `IssuableTransferOrderListItem[]` (inline `destinationBranchName`, **không** trả root `{[id]:branch}` map). Order by `createdAt DESC`.
  - Mở rộng `confirmExport(id, actor, dto?: ExportTransferOrderDto)`:
    - Giữ guard `status===DRAFT` (`ConflictException`) + `actor.branchId===order.sourceBranchId` (`ForbiddenException`).
    - Nếu `dto?.lines?.length`: validate **mỗi `itemId ∈` tập itemId của `order.lines`** (`BadRequestException` nếu lệch) và `quantity > 0`; dùng `dto.lines` (đã có `locationId`/`unitPrice` do FE resolve) làm payload GoodsIssue. Nếu không có `lines`: derive như cũ (per-line `sourceStorageId ?? header` → unassigned location).
    - `goodsIssueService.createAndPost({ purpose: TRANSFER_OUT, targetBranchId: order.destinationBranchId, referenceType: GoodsIssueReferenceType.TRANSFER_ORDER, referenceId: order.id, reason: dto?.reason ?? 'TRANSFER_ORDER ' + documentNumber, notes: dto?.notes, lines })`.
    - Trong tx: `status=IN_PROGRESS`, `exportGoodsIssueId=gi.id`, `exportedAt/By`. Publish `inventory.transfer-order.exported` (đã có ở ITV).
- `apps/api/src/modules/inventory/transfer-order/transfer-order.controller.ts`:
  - `GET /issuable` — `@RequirePermission('inventory.transfer.read')`, `@Actor()`, query DTO `IssuableTransferOrderQueryDto { from?: ISO, to?: ISO }`.
  - `POST /:id/export` — thêm `@Body() dto: ExportTransferOrderDto` **optional** (`@IsOptional()` cho mọi field; `lines?: ExportTransferOrderLineDto[]` với `@ValidateNested({each:true})`, `@IsUUID() itemId`, `@IsUUID() locationId`, `@Min(0.001) quantity`, `@IsOptional() unitPrice`, `@IsOptional() notes`). Giữ `@RequirePermission('inventory.transfer.export')` + `@RequireBranchScope()`.
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts` — chỉ chỉnh nếu `createAndPost` chưa nhận/ghi `referenceType`/`referenceId` cho path internal: bảo đảm 2 field này được persist (path STOCK_TAKE đã ghi `reference*`, nên thường chỉ cần truyền qua).

## Acceptance Criteria

- [ ] `GET /issuable` chỉ trả `DRAFT` + `sourceBranchId=actor.branchId` + đúng org + trong khoảng ngày; lệnh chi nhánh khác / `IN_PROGRESS`/`COMPLETED`/`CANCELLED` bị loại; mỗi dòng có `destinationBranchName` inline.
- [ ] `POST /:id/export` **có** body `lines`: GoodsIssue dùng đúng dòng đã sửa; `referenceType=TRANSFER_ORDER`, `referenceId=order.id` được ghi; lệnh nhảy `IN_PROGRESS`, `exportGoodsIssueId` set; tồn nguồn giảm theo dòng.
- [ ] `POST /:id/export` **không** body: hành vi derive cũ giữ nguyên (không regression nút `TransferOrdersPage`).
- [ ] Validate: `itemId` ngoài tập dòng của lệnh → `400`; `quantity<=0` → `400`; export khi không phải `DRAFT` → `409`; sai chi nhánh nguồn → `403`.
- [ ] Idempotent: thừa hưởng `IdempotencyInterceptor`; state-guard chống double-export.
- [ ] Mọi query lọc `actor.organizationId`; không rò chéo tenant.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; `transfer-order.service.spec.ts` thêm case: `listIssuable` scope (branch/status/date), export-with-lines ghi reference + advance status, validate subset/qty, conflict/forbidden.
- [ ] Không gọi `StockLedgerService` trực tiếp — chỉ qua `GoodsIssueService`.
- [ ] Không schema change; `synchronize` false; `migration:generate` không drift.
- [ ] Không Vietnamese trong source backend (error/comment/Swagger/log English).

## Tech Approach

```ts
// transfer-order.service.ts
async confirmExport(id: string, actor: ActorContext, dto?: ExportTransferOrderDto) {
  const o = await this.getById(id, actor.organizationId);
  if (o.status !== TransferOrderStatus.DRAFT) throw new ConflictException('Transfer order is not DRAFT');
  if (actor.branchId !== o.sourceBranchId) throw new ForbiddenException('Export must be confirmed from the source branch');

  let lines;
  if (dto?.lines?.length) {
    const allowed = new Set(o.lines.map((l) => l.itemId));
    for (const l of dto.lines) {
      if (!allowed.has(l.itemId)) throw new BadRequestException('Line item is not part of the transfer order');
      if (Number(l.quantity) <= 0) throw new BadRequestException('Line quantity must be positive');
    }
    lines = dto.lines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, quantity: Number(l.quantity), unitPrice: l.unitPrice ?? 0, notes: l.notes }));
  } else {
    lines = await this.deriveExportLines(o, actor); // existing per-line storage→location resolve
  }

  const gi = await this.goodsIssueService.createAndPost({
    locationId: lines[0].locationId,
    purpose: GoodsIssuePurpose.TRANSFER_OUT,
    targetBranchId: o.destinationBranchId,
    referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
    referenceId: o.id,
    reason: dto?.reason ?? `TRANSFER_ORDER ${o.documentNumber}`,
    notes: dto?.notes,
    lines,
  }, actor);

  return this.dataSource.transaction(async (m) => {
    await m.update(TransferOrderEntity, id, {
      status: TransferOrderStatus.IN_PROGRESS, exportGoodsIssueId: gi.id,
      exportedAt: new Date(), exportedBy: actor.userId,
    });
    return this.getById(id, actor.organizationId);
  });
}
```

> `listIssuable` join `branches` để lấy `destinationBranchName`; theo feedback "inline relations" — gắn tên thẳng vào từng dòng, không trả map gốc. Date range: `from`/`to` mặc định theo "Tháng này" do FE truyền; BE chỉ áp khi có giá trị.

## Testing Strategy

- Unit (`transfer-order.service.spec.ts`): mock `GoodsIssueService`/repo; assert `listIssuable` lọc đúng (seed lệnh khác branch/khác status/ngoài range → loại), export-with-lines payload (referenceType/referenceId/lines), validate subset/qty, conflict/forbidden, idempotent guard.
- Tích hợp ledger thật + reference persist ở E2E (TKT-IFT-06).

## Dependencies

- Depends on: TKT-IFT-01, EPIC-07062026 (ITV-03 `confirmExport`, ITV-04 controller, ITV-05 quyền export).
- Blocks: TKT-IFT-03, TKT-IFT-04, TKT-IFT-06.

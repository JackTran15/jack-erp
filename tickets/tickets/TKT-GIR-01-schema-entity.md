# TKT-GIR-01 Migration + entity: deliverer / references(jsonb) / occurredAt

## Epic

[EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](../epics/EPIC-08062026-goods-issue-form-roundtrip.md)

## Layer

🟦 Backend — schema migration + entity. **CÓ migration** (hand-written, 3 cột nullable trên `goods_issues`).

## Summary

Thêm 3 cột vào `goods_issues` để phiếu xuất kho lưu được các trường người dùng nhập mà hiện đang rớt: **Người giao** (`deliverer`), **Tham chiếu** (danh sách mã `references`), **Ngày/Giờ xuất** (`occurred_at`). Tất cả nullable + default an toàn nên phiếu cũ vẫn valid.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-AddGoodsIssueDelivererReferencesOccurredAt.ts` (new) — hand-written:
  ```sql
  ALTER TABLE "goods_issues" ADD COLUMN "deliverer" varchar NULL;
  ALTER TABLE "goods_issues" ADD COLUMN "references" jsonb NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE "goods_issues" ADD COLUMN "occurred_at" timestamptz NULL;
  ```
  `down`: drop 3 cột (`DROP COLUMN IF EXISTS`).
- `apps/api/src/modules/inventory/goods-issue/goods-issue.entity.ts` — thêm 3 cột khớp migration:
  ```ts
  @Column({ type: 'varchar', nullable: true, comment: 'Free-text deliverer name (Người giao)' })
  deliverer?: string | null;

  @Column({ name: 'references', type: 'jsonb', default: () => "'[]'::jsonb", comment: 'FE-supplied reference codes shown as Tham chiếu' })
  references: string[];

  @Column({ name: 'occurred_at', type: 'timestamptz', nullable: true, comment: 'User-entered issue date+time; falls back to createdAt' })
  occurredAt?: Date | null;
  ```

## Acceptance Criteria

- [ ] Migration chạy sạch trên DB hiện có; phiếu cũ: `deliverer`/`occurred_at` = NULL, `references` = `[]`.
- [ ] Entity khớp cột (tên snake_case `occurred_at`, `references`); `synchronize` giữ false.
- [ ] `migration:generate` sau đó không sinh drift ngoài 3 cột này.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + build xanh.
- [ ] Không Vietnamese trong source backend (comment/Swagger/log English).
- [ ] Không sửa cột khác của `goods_issues`.

## Tech Approach

Theo mẫu cột `attachment_ids` jsonb (`TransferOrderEntity`) cho `references`, và mẫu `*_at timestamptz nullable` cho `occurred_at`. Timestamp file migration lớn hơn migration mới nhất hiện có (xem `apps/api/src/database/migrations/`).

## Testing Strategy

- Migration up/down chạy tay trên `erp_dev`; kiểm `information_schema.columns`.

## Dependencies

- Blocks: TKT-GIR-02 (DTO + service đọc/ghi 3 cột).

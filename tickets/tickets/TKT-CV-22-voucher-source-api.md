# TKT-CV-22 Voucher source filter + sourceLink (API delta)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only. **(rescoped)** — phần UI (filter dropdown, badge "Tự động", section "Chứng từ nguồn") **deferred sang FE epic riêng**; ticket này chỉ giao API contract.

## Summary

Mở rộng list + detail API của Phiếu thu / Phiếu chi để FE epic sau filter theo nguồn và hiển thị link chứng từ gốc — không thay đổi schema.

## Deliverables

- `GET /cash-receipts?source=` filter: `POS_SALE | DEBT_COLLECTION | MANUAL` (map `source` → `reference_type`).
- `GET /cash-payments?source=` filter: `GOODS_RECEIPT | EXPENSE | MANUAL`.
- `GET /cash-receipts/:id` & `GET /cash-payments/:id` response thêm `sourceLink { sourceType, sourceId, sourceDocumentNumber }` derive từ `reference_type`/`reference_id`.
- Query DTO cập nhật + `@ApiProperty`.

## Acceptance Criteria

- [x] `source=POS_SALE` trả đúng tập (referenceType=INVOICE); `DEBT_COLLECTION` → INVOICE_DEBT; `MANUAL` → MANUAL/null.
- [x] `source=GOODS_RECEIPT` / `EXPENSE` / `MANUAL` trên cash-payments tương tự.
- [x] Detail response có `sourceLink`; `MANUAL` → `sourceLink` null/omitted.
- [x] `sourceDocumentNumber` resolve được khi source có document number (best-effort; null nếu không có).
- [x] Multi-tenant giữ nguyên; filter không leak cross-org.

## Definition of Done

- [x] Unit test filter mapping + sourceLink derivation.
- [x] Swagger phản ánh query param + response field mới.
- [x] Source tiếng Anh.

## Tech Approach

- `source` chỉ là alias map sang `reference_type` ở service; không thêm column.
- `sourceDocumentNumber` resolve qua lookup nhẹ theo `reference_type` (invoice/debt/GR/expense) — cân nhắc batch để tránh N+1, hoặc chỉ trả ở detail (single record) nên không nặng.

## Dependencies

- Phụ thuộc: TKT-CV-15 (voucher có `reference_type`/`reference_id` từ auto-create).
- Blocks: TKT-CV-23. FE consume ở epic FE riêng.

# TKT-GRT-06 E2E + test plan + DoD gate

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟪 Test — service/e2e + manual verify; cổng DoD.

## Summary

Chứng minh chân nhập đối xứng chân xuất: lệnh đã export (IN_PROGRESS) hiện trong picker importable của chi nhánh đích; chọn → nhập → lệnh COMPLETED, phiếu nhập post, header round-trip.

## Deliverables

- `transfer-order.service.spec.ts` (unit): `listImportable` scope (branch/status/date + inline XK số/tổng); `confirmImport` forward header + kho nhận; conflict (không IN_PROGRESS) / forbidden (sai chi nhánh đích).
- E2E (`apps/api/test/e2e`, mirror `goods-issue-from-transfer.e2e-spec.ts`): tạo lệnh → export (IN_PROGRESS) → `GET /importable` thấy lệnh với `exportGoodsIssueDocumentNumber` + `totalAmount` → `POST /:id/import` (destinationStorageId + header) → lệnh COMPLETED, `importGoodsReceiptId` set; GET phiếu nhập: `purpose=TRANSFER_IN`, `referenceType=STOCK_TRANSFER`, `referenceId`, `deliveredBy`/`providerId`/`references` round-trip; lệnh rời khỏi picker importable; replay idempotent → 1 phiếu nhập.
- Manual: tái hiện kịch bản screenshot — mục đích "Điều chuyển từ cửa hàng khác" → "Chọn chứng từ điều chuyển" → dialog có dữ liệu → chọn → form nạp (khóa) → chọn Kho nhận → Lưu.

## Acceptance Criteria

- [ ] E2E: round-trip đủ; lệnh chỉ nhập 1 lần; header lưu lên phiếu nhập.
- [ ] `GET /importable` không trả lệnh `DRAFT`/`COMPLETED`/chi nhánh khác.
- [ ] Idempotency replay không tạo phiếu nhập thứ 2.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` xanh (e2e serial; đọc output thật).
- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Snapshot OpenAPI committed (TKT-GRT-03).
- [ ] Không TODO/FIXME ngoài kế hoạch; không Vietnamese trong source backend.

## Dependencies

- Depends on: TKT-GRT-02 (BE), TKT-GRT-05 (FE).

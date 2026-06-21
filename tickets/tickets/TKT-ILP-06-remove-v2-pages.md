# TKT-ILP-06 Gỡ 3 trang v2 (FE) + cleanup component mồ côi

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Gỡ 3 trang FE v2 đã làm sai hướng (Nhập/Xuất/Chuyển kho v2) khỏi `backoffice-web`: xoá page component, route trong `App.tsx`, mục nav trong `navConfig.ts`. Sau đó **grep xác nhận** và xoá các component/hook FE trở thành mồ côi (chỉ v2 dùng). **Giữ nguyên backend v2** — các endpoint `/v2/*/search` vẫn được trang list v1 dùng. Làm cuối cùng, sau khi 3 trang v1 đã có dialog mới (ILP-03/04/05).

## Deliverables

- Xoá thư mục page v2:
  - `apps/backoffice-web/src/pages/goods-receipt-v2/`
  - `apps/backoffice-web/src/pages/goods-issue-v2/`
  - `apps/backoffice-web/src/pages/stock-transfer-v2/`
- `apps/backoffice-web/src/App.tsx` — gỡ route `/inventory/goods-receipts-v2`, `/inventory/goods-issues-v2`, `/inventory/stock-transfers-v2` + import.
- `apps/backoffice-web/src/components/layout/navConfig.ts` — gỡ 3 mục nav "(v2)".
- Grep + xoá component/hook mồ côi (chỉ khi **không còn** reference ngoài v2):
  - `components/shared/product-group-search/` (`ProductGroupSearchDialog`, `useSearchProductGroups`)
  - `hooks/useResolveItemLocations.ts`
  - `components/shared/counterparty-search/` (`CounterpartySearchDialog`, `useSearchCounterparties`) — **chỉ** nếu không trang v1 nào dùng.

## Acceptance Criteria

- [ ] Không còn route/nav `*-v2` cho Nhập/Xuất/Chuyển kho.
- [ ] `grep -r "goods-receipt-v2\|goods-issue-v2\|stock-transfer-v2\|GoodsReceiptV2Page\|GoodsIssueV2Page\|StockTransferV2Page" apps/backoffice-web/src` → rỗng.
- [ ] Mỗi component định xoá đã `grep` xác nhận 0 reference còn lại trước khi xoá; nếu còn dùng thì **giữ**.
- [ ] Backend v2 (controller/DTO/command + `/v2/*/search`) **không đổi**.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; không import treo.
- [ ] Verify thủ công: sidebar không còn mục "(v2)"; điều hướng tới Nhập/Xuất/Chuyển kho mở đúng trang v1 có dialog mới.
- [ ] Trang list v1 (vd Nhập kho) vẫn tìm kiếm được qua `POST /v2/goods-receipts/search`.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```bash
# Trước khi xoá mỗi component, xác nhận mồ côi:
grep -rn "ProductGroupSearchDialog\|useSearchProductGroups" apps/backoffice-web/src
grep -rn "useResolveItemLocations" apps/backoffice-web/src
grep -rn "CounterpartySearchDialog\|useSearchCounterparties" apps/backoffice-web/src
```

## Testing Strategy

- Verify thủ công + `build`.

## Dependencies

- Depends on: TKT-ILP-03, TKT-ILP-04, TKT-ILP-05
- Blocks: —

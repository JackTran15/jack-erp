# TKT-RFF-05 Verify + DoD gate

## Epic

[EPIC-06072026 Report filter theo mode + kho phụ thuộc cửa hàng](../epics/EPIC-06072026-report-filter-store-warehouse.md)

## Summary

Gate cuối: verify thủ công (browser) cả 2 mode CHAIN/SINGLE — dòng Cửa hàng ẩn/hiện đúng, Kho cascade, số liệu scope đúng, control đồng nhất @erp/ui; build sạch, openapi committed.

## Deliverables

Checklist verify trong PR (Claude Preview / browser, backoffice + API dev):

**CHAIN mode (header = "Chuỗi")**
- [ ] #1/#2/#3/#6 hiện dòng "Cửa hàng" (multi-select). #3 có cả Cửa hàng + Kho.
- [ ] Chọn "Theo nhóm cửa hàng" → 1 cửa hàng → Kho chỉ kho của cửa hàng đó (không trùng ×N); số liệu theo cửa hàng.
- [ ] Đổi cửa hàng → Kho reset "Tất cả kho" + list đổi. scope='Tất cả' → Kho = tất cả kho org.
- [ ] Network: `filter-options?type=warehouse&branchIds=...` + `search {filters.store...}` đúng; 0 request fail; 0 console error.

**SINGLE mode (header = 1 chi nhánh, vd "Cà Mau")**
- [ ] #1/#2/#3/#6 KHÔNG có dòng "Cửa hàng".
- [ ] Kho chỉ hiện kho của Cà Mau.
- [ ] "Lấy dữ liệu" → `search` gửi `store={scope:'group', storeIds:[camau]}` → số liệu chỉ của Cà Mau.
- [ ] Đổi header sang chi nhánh khác → Kho + số liệu cập nhật theo.

**Quyền chi nhánh (backend)**
- [ ] `type=store` chỉ trả chi nhánh user quản lý (`actor.branchIds`); `type=warehouse` chỉ kho của các chi nhánh đó.
- [ ] `POST search` với storeId ngoài `actor.branchIds` (cùng org) → 403; `scope='all'` với user bị giới hạn → chỉ số liệu chi nhánh của user.
- [ ] E2E user 2-branch: request branch thứ 3 → 403; store options = 2 branch.

**Chung**
- [ ] Mọi dropdown (Kho, Nhóm hàng hóa, Thống kê theo, Kỳ báo cáo…) + date render bằng @erp/ui (không native OS select/màu hardcode).
- [ ] Regression: báo cáo bán hàng + báo cáo #4/#5/#7/#8 không đổi hành vi.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test` xanh (handler spec RFF-01).
- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Tất cả AC của TKT-RFF-01..04 tick.
- [ ] openapi snapshot + api-client committed khớp code.

## Definition of Done

- [ ] Screenshot/checklist verify đính PR (2 mode).
- [ ] Không regression; không TODO/FIXME ngoài plan.

## Dependencies

- Depends on: TKT-RFF-01..04.
- Blocks: — (gate)

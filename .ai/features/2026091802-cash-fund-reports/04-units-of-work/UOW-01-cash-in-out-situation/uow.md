---
id: UOW-01
slug: cash-in-out-situation
title: Nhóm báo cáo "Quỹ tiền" mở được, chạy được "Tình hình thu chi" từ đầu đến cuối
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-07]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-19, AC-20, AC-21]
risk: medium
status: todo
rollback: Revert các commit của UoW + `pnpm migration:revert` một lần (migration quyền chỉ thêm dòng `permissions`/`role_permissions`, xoá sạch trong `down`). Không đổi bảng chứng từ. FE quay về khối `CASH_FUND` bị comment như hôm nay.
---

# UOW-01 — "Quỹ tiền" mở được, "Tình hình thu chi" chạy từ đầu đến cuối

Lát cắt đầu tiên dựng toàn bộ hạ tầng của domain `cash` (khoá, quyền, module, DTO, handler,
templates, export, print, dispatch FE) và chứng minh nó bằng một báo cáo đủ khó: khung cố
định + dòng mục động + số dư đầu/cuối kỳ trên hai loại quỹ. UOW-02 và UOW-03 chỉ còn thêm
`ReportDefinition` + registry FE.

## Demo script

Trên `erp_dev` (`make dev-api`, `make dev-backoffice`), tài khoản admin, chi nhánh
**Hồ Chí Minh** (có phiếu thu POS và phiếu chi theo mục — kiểm bằng
`/treasury/cash/receipts-expenses` trước khi demo; nếu trống, tạo 1 phiếu thu POS giả lập
qua checkout POS, 2 phiếu chi có mục "Tiền điện"/"Tiền nước", 1 phiếu chi rồi đảo).

1. Menu Báo cáo → có mục **Quỹ tiền** → `/reports/cash-fund`. "Chọn báo cáo" liệt kê 5 báo cáo
   đúng thứ tự; chỉ **Tình hình thu chi** chạy được ở UoW này (4 báo cáo còn lại hiện "Chưa
   hỗ trợ" như các stub khác) (AC-01).
2. Kỳ báo cáo = **Tháng này** → Lấy dữ liệu: bảng 4 cột Khoản mục / Tiền mặt / Tiền gửi /
   Tổng cộng; dòng I, II (đậm), Thu từ bán hàng, các mục thu, Thu khác, III (đậm), Chi mua
   hàng hóa, Tiền điện, Tiền nước, Chi khác, IV (đậm). Không có dòng mục = 0; phiếu đã đảo
   không đẩy số (AC-03, AC-05).
3. Đối chiếu: I + II − III của từng cột = IV; đổi kỳ sang **Tháng trước** → IV tháng trước =
   I tháng này (AC-04). Chọn kỳ **Năm trước** (không có phiếu) → 9 dòng khung, toàn 0 (AC-06).
4. Chuyển sang chế độ **Chuỗi** với tài khoản admin (có `reporting.cash.consolidated.read`)
   → số cộng mọi chi nhánh; đăng nhập tài khoản quản lý chi nhánh (env `local-backoffice-bm`)
   → chỉ thấy chi nhánh mình; tài khoản kho (`local-backoffice-wh`) → không có menu Quỹ tiền,
   gọi tay `POST /reports/cash-fund/search` → 403 (AC-07, AC-02).
5. **Xuất khẩu** → file `.xlsx` mở ra đúng 4 cột, 9+N dòng, dòng đậm giữ đậm (AC-19).
   **In** → cửa sổ in với cùng bảng (AC-20). **Sửa mẫu** → tắt cột Tiền gửi, Lưu, tải lại →
   còn 3 cột; "Lấy mẫu ngầm định" → 4 cột (AC-21).
6. `pnpm --filter @erp/api test -- cash-fund-report` xanh; `pnpm --filter @erp/api test:e2e -- cash-fund-report` xanh;
   `git diff --stat` chỉ gồm `packages/shared-interfaces`, `apps/api`, `apps/backoffice-web`,
   `packages/api-client/src/generated/schema.ts`, `openapi.snapshot.json`, `.ai/features/2026091802-*`.

## In scope

- Khoá báo cáo + quyền domain `cash` (shared-interfaces, migration, seed vai trò)
- Module `reporting/cash-fund-report/` với đủ bộ route như debt-report
- `CashFundPeriodService` (số dư đầu kỳ, tổng theo mục đích / mục, dòng chứng từ gộp) — nền cho cả 5 báo cáo
- `cash-in-out-situation.report.ts`
- FE: bật nhóm, route, dispatcher `cash`, registry + metadata cho #2
- e2e + `openapi:generate`

## Not in scope

- 4 báo cáo còn lại (UOW-02, UOW-03) — metadata FE của chúng chưa có `backendKey` nên dropdown
  hiện nhưng chưa chạy
- Drill-down từ ô IV (UOW-02, cần #3 tồn tại)
- Filter line mới (`PAYMENT_METHOD`, `EXPENSE_CATEGORY`, bucket thời gian) — UOW-02/03

## Risks

| Risk | Mitigation |
| --- | --- |
| Số I lệch số dư quỹ trên trang Sổ quỹ (`created_at` vs ngày chứng từ, ADR-02) | Tooltip tiêu đề #2 ghi "theo ngày chứng từ"; DoD có bước so với MShopKeeper chứ không so với Sổ quỹ |
| Thiếu index trên `(organization_id, branch_id, status, voucher_date)` làm `SUM` chậm với kỳ 1 năm | T-01-05 đo `EXPLAIN` trên `erp_dev`; nếu seq scan → thêm migration index trong cùng ticket (đã khai `touches`) |
| `report-permissions.contract.spec.ts` khoá key với nhãn, seed và grants trong một bộ assert | T-01-01 gộp shared-interfaces + nhãn + migration + seed (T-01-02 đã gộp vào, G3 reopened 2026-09-18) |
| Phiếu tiền gửi có `PENDING_APPROVAL` — lọc `status = POSTED` loại đúng nhưng người dùng có thể mong thấy | Ghi trong phụ đề: "Chỉ chứng từ đã ghi sổ" |

## Definition of done

- [ ] AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-19, AC-20, AC-21 có test (unit hoặc e2e) và xanh
- [ ] `pnpm --filter @erp/api build`, `pnpm --filter @erp/backoffice-web build` xanh
- [ ] `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` đã tái sinh và commit
- [ ] Đối chiếu MShopKeeper: cùng chi nhánh + cùng kỳ, chụp ảnh I/II/III/IV hai bên, ghi vào `07-verification.md`; chênh lệch (nếu có) giải thích được bằng A-01/A-02/A-04
- [ ] Demo script chạy trước Akenzy và được chấp nhận tại G4

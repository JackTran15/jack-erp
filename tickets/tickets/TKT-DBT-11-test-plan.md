# TKT-DBT-11 E2E + test plan + DoD gate

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Ticket chốt epic: E2E xác nhận cả 4 báo cáo hoạt động đúng end-to-end (BE thật +
FE thật), đặc biệt các điểm rủi ro cao đã cảnh báo trong đặc tả (công thức
cumulative vs delta ở #4, gộp/không-gộp chi nhánh ở #1-2 vs #3-4, merge 2 nguồn dữ
liệu ở #1).

## Deliverables

- `apps/api/test/e2e/debt-reports.e2e-spec.ts`:
  - Seed dữ liệu tối thiểu: 1 khách hàng có cả `InvoiceDebtEntity` và
    `ReceivableEntity` trong cùng kỳ (verify #1 gộp đúng); 1 khách hàng có hoá đơn
    trả 1 phần + phiếu thu nợ (verify #2 đúng theo ví dụ số liệu trong doc); 1 NCC
    có giao dịch ở 2 branch (verify #3 gộp mặc định + thu hẹp qua `branchId`); 1
    phiếu nhập nhiều dòng cùng SKU lặp lại (verify #4 cumulative đúng cả 2 chế độ
    `groupBy`).
  - Test cross-tenant isolation: user org khác không thấy dữ liệu.
  - Test permission: user không có `reporting.debts.read` → 403.
- Test plan thủ công (checklist trong PR description, không cần file riêng):
  - Mở từng báo cáo trong preview, đối chiếu số liệu với ví dụ trong
    `docs/24-debt-reports-spec.md`.
  - Xác nhận dialog "Chọn báo cáo" tại `/reports/debts` đúng 4 lựa chọn.
  - Xác nhận filter bắt buộc (`Khách hàng`/`Nhà cung cấp`) chặn submit khi trống.

## Acceptance Criteria

- [ ] E2E cover đủ 4 báo cáo, mỗi báo cáo ít nhất 1 happy-path + 1 edge case
      (không có dữ liệu trong kỳ, filter bắt buộc thiếu).
- [ ] Assertion số học chính xác đến đơn vị đồng cho các case đã có trong doc
      (không chỉ check "có trả về data").
- [ ] Regression: 1 báo cáo sales + 1 báo cáo kho đã có từ trước vẫn chạy đúng sau
      khi thêm `backendSource: "debt"` (không phá 2 nhánh cũ).

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` pass (chạy serial, `erp_test` DB).
- [ ] `pnpm build` (workspace-wide) pass.
- [ ] PR description có checklist test thủ công đã tick đủ.
- [ ] Cập nhật `docs/24-debt-reports-spec.md` — thêm 1 dòng ghi chú "Đã implement,
      xem EPIC-15072026" ở đầu file (để tránh nhầm đây vẫn là tài liệu nháp).

## Tech Approach

Theo pattern `apps/api/test/e2e/inventory-report-v2.e2e-spec.ts` (đã có, dùng làm
mẫu cấu trúc test suite cho báo cáo).

## Testing Strategy

- E2E: `debt-reports.e2e-spec.ts`, chạy nghiêm túc với `erp_test`, `forceExit:
  true` (kafkajs consumer không liên quan ở đây nên rủi ro treo thấp hơn epic
  khác).
- Thủ công: preview toàn bộ 4 báo cáo trước khi merge.

## Dependencies

- Depends on: TKT-DBT-10 (và gián tiếp toàn bộ ticket trước).
- Blocks: không có (ticket cuối epic).

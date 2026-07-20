# TKT-PRF-11 E2E + test plan + DoD gate

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Ticket chốt epic: E2E xác nhận cả 3 báo cáo hoạt động đúng end-to-end (BE thật + FE thật),
đặc biệt các điểm rủi ro cao đã cảnh báo xuyên suốt các ticket trước (direction OUT/IN vs
invoice.type, giá vốn âm, verify chéo báo cáo #1/#2, công thức phân cấp báo cáo #3).

## Deliverables

- `apps/api/test/e2e/profit-reports.e2e-spec.ts`:
  - Seed dữ liệu tối thiểu: 1 hoá đơn SALE thường; 1 hoá đơn RETURN; 1 hoá đơn EXCHANGE (có
    cả dòng OUT và IN trong cùng hoá đơn — dùng để verify cả báo cáo #1/#2/#3 tách đúng
    theo `direction`); 1 mặt hàng có tổng trả nhiều hơn tổng bán trong kỳ (verify giá vốn
    âm không bị chặn nhầm thành lỗi); nếu TKT-PRF-04 chọn hướng dùng `ExpenseEntity`, seed
    thêm 1 expense `POSTED` trong kỳ.
  - Test verify-chéo: `profit-by-item` và `gross-profit-by-invoice` chạy cùng khoảng ngày,
    cùng branch scope → dòng Tổng phải khớp nhau tuyệt đối (revenue/costOfGoods/
    grossProfit).
  - Test `business-results`: assert đúng toàn bộ cây công thức I → IV trên dữ liệu seed,
    cả 2 kỳ độc lập.
  - Test cross-tenant isolation: user org khác không thấy dữ liệu.
  - Test permission: user không có `reporting.profit.read` → 403.
  - Test branch scoping: user không có `CONSOLIDATED_PERMISSION` chỉ thấy dữ liệu branch
    của mình; user có permission + chọn "Chuỗi cửa hàng" thấy toàn bộ.
- Test plan thủ công (checklist trong PR description, không cần file riêng):
  - Mở từng báo cáo trong preview, đối chiếu số liệu với 4 bộ screenshot mẫu đã dùng khi
    viết ticket (lưu trong lịch sử phiên plan, không phải file trong repo).
  - Xác nhận dialog "Chọn báo cáo" tại `/reports/profit` đúng 3 lựa chọn.
  - Báo cáo #1: đổi "Thống kê theo" giữa 3 lựa chọn, xác nhận cột đổi đúng.
  - Báo cáo #3: nhập 2 kỳ khác nhau, xác nhận cột "Thay đổi (%)"/"Thay đổi (Số tiền)" đúng,
    indent/độ đậm hiển thị đúng.

## Acceptance Criteria

- [ ] E2E cover đủ 3 báo cáo, mỗi báo cáo ít nhất 1 happy-path + 1 edge case (không có dữ
      liệu trong kỳ, hoá đơn EXCHANGE, giá vốn âm).
- [ ] Assertion số học chính xác đến đơn vị đồng (không chỉ check "có trả về data").
- [ ] Test verify-chéo báo cáo #1/#2 pass với dữ liệu seed thực tế (không chỉ trong unit
      test mock).
- [ ] Regression: 1 báo cáo sales + 1 báo cáo kho + 1 báo cáo công nợ đã có từ trước vẫn
      chạy đúng sau khi thêm `backendSource: "profit"` (không phá 3 nhánh cũ).

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` pass (chạy serial, `erp_test` DB).
- [ ] `pnpm build` (workspace-wide) pass.
- [ ] PR description có checklist test thủ công đã tick đủ, kèm screenshot đối chiếu với ảnh
      mẫu gốc cho cả 3 báo cáo.
- [ ] Toàn bộ câu hỏi ❓ đánh dấu "Cần xác nhận" ở TKT-PRF-04 và TKT-PRF-10 đã có câu trả
      lời ghi lại trong ticket tương ứng trước khi merge ticket này.

## Tech Approach

Theo pattern `apps/api/test/e2e/debt-reports.e2e-spec.ts` (nếu đã tồn tại từ epic trước) làm
mẫu cấu trúc test suite cho báo cáo.

## Testing Strategy

- E2E: `profit-reports.e2e-spec.ts`, chạy nghiêm túc với `erp_test`, `forceExit: true`.
- Thủ công: preview toàn bộ 3 báo cáo trước khi merge.

## Dependencies

- Depends on: TKT-PRF-09, TKT-PRF-10 (và gián tiếp toàn bộ ticket trước).
- Blocks: không có (ticket cuối epic).

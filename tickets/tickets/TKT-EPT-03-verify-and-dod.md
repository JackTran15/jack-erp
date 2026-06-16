# TKT-EPT-03 Verify + DoD (flow thủ công + parity 2 bản in)

## Epic

[EPIC-16062026 POS "In tạm tính"](../epics/EPIC-16062026-pos-estimate-print.md)

## Summary

Cổng nghiệm thu cuối: typecheck build, chạy POS checkout thủ công và đối chiếu cả "In tạm tính" lẫn "In hóa đơn" với [Image #2] + các kịch bản đặt cọc / công nợ một phần / không khuyến mãi. Xác nhận "In tạm tính" không còn gọi API.

## Deliverables

- Không file sản phẩm mới — chỉ verify + ghi kết quả vào PR description.
- (Tùy chọn) spec `checkoutReceiptFactory.spec.ts` nếu wiring vitest ad-hoc khả thi; nếu không, verify bằng flow thủ công.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/pos-web build` (tsc) green.
- [ ] **No-draft:** DevTools Network — bấm "In tạm tính" ≥3 lần → **0** request `POST /invoices`; danh sách "Lưu tạm" không tăng.
- [ ] **Parity [Image #2]** (3 SP, gross 2.345.000, KM dòng 213.500, debt on): cả 2 bản in hiện Tiền hàng 2.345.000 / Khuyến mãi 213.500 / KM theo mặt hàng 213.500 / Tổng thanh toán 2.131.500 / Trả lại khách 0 / Khách nợ 2.131.500. Bản tạm tính có tiêu đề "HÓA ĐƠN TẠM TÍNH", bản cuối là "HÓA ĐƠN".
- [ ] **Đặt cọc:** đặt cọc 50.000, trả đủ phần còn lại → Khách nợ/Trả lại đúng net-out; không có dòng "Đặt cọc".
- [ ] **Công nợ một phần:** debt + tiền mặt 145.000 → receipt "đã trả 145.000" + Khách nợ = phần dư (không còn "paid 0 / nợ toàn phần").
- [ ] **Không KM:** giỏ không có giảm giá → không in dòng Khuyến mãi/KM theo mặt hàng; Tiền hàng = Tổng thanh toán.
- [ ] Giỏ giữ nguyên sau "In tạm tính"; reset đúng sau "Thu tiền" (luồng cũ không hồi quy).

## Definition of Done

- [ ] Tất cả AC trên pass, kèm ảnh chụp 2 bản in trong PR.
- [ ] `openapi.snapshot.json` + `packages/api-client` không đổi (diff sạch); không file backend nào đổi.
- [ ] Không Vietnamese trong backend source (N/A — FE-only).
- [ ] Không TODO/FIXME ngoài plan; không `index.ts` mới.

## Testing Strategy

- Manual checkout flow (`make dev-pos`, :3001): chạy 4 kịch bản (Image #2 / đặt cọc / nợ một phần / không KM) cho cả "In tạm tính" và "Thu tiền".
- tsc build làm cổng cuối; spec đơn vị tùy chọn nếu vitest chạy được.

## Dependencies

- Depends on: TKT-EPT-01, TKT-EPT-02.
- Blocks: (none — cổng cuối epic).

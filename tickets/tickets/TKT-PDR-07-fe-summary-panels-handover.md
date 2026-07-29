# TKT-PDR-07 FE: TAB 1 panels + BÀN GIAO TIỀN + kiểm đếm modal

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Dựng tab "Tổng hợp": các panel số liệu từ `POST /reports/pos/daily-summary` (TỔNG Thu/Chi/Công nợ, HÀNG BÁN, HÀNG TRẢ, KHÁC) + panel BÀN GIAO TIỀN (form nhập tay, FE-only) và modal "Chi tiết kiểm đếm" (bảng mệnh giá → Tổng tiền → đổ vào "Tiền bàn giao"). Không lưu DB.

## Deliverables

- `components/page-components/DailyReport/DailySummaryTab/DailySummaryTab.tsx` — layout 3 cột như screenshot.
- Panel: `ThuPanel/`, `ChiPanel/`, `CongNoPanel/`, `HangBanTraPanel/` (gộp Hàng bán + Hàng trả), `KhacPanel/` — hiển thị số từ `useDailySummaryQuery`, format `vi-VN`.
  - Thu: Tiền mặt, Thẻ, (ATM nếu backend trả), Chuyển khoản, Voucher, Điểm. Chi: Tiền mặt, Chuyển khoản. Công nợ: Ghi nợ, Giảm nợ.
  - KHÁC: Tổng SL hóa đơn, SL hóa đơn bán hàng, SL hóa đơn đổi trả, SL hóa đơn đổi trả mua thêm, SL Voucher, SL Mã ưu đãi, SL Biên lai thanh toán thẻ (các cái backend trả 0 vẫn hiển thị).
- `HandoverPanel/HandoverPanel.tsx` — form: Số tiền bàn giao từ ban đầu, Nhận từ (select NV), Tiền bàn giao (readonly, từ kiểm đếm), nút "Chi tiết kiểm đếm", Chênh lệch, Tổng SL hóa đơn (từ summary), Người nhận bàn giao (select NV), Ghi chú, nút "In bàn giao". State FE-only (`CashHandoverForm`).
- `HandoverPanel/CashCountModal/CashCountModal.tsx` — modal "Chi tiết kiểm đếm" trên `PosDialog`: bảng mệnh giá (500000…1000) × Số lượng = Thành tiền, Tổng tiền; Đồng ý → set `handoverAmount` = tổng.
- Cập nhật `use-daily-report.ts` — gọi `useDailySummaryQuery` (body: issuedAt/customRange + cashierId/salespersonId), state form bàn giao + kiểm đếm + `cashCountOpen`.

## Acceptance Criteria

- [ ] Panel hiển thị đúng số từ endpoint; Thu - chi = tổng thu − tổng chi (hoặc dùng `thuTruChi` từ API).
- [ ] Đổi khoảng ngày/Thu ngân/NVBH → panel refetch.
- [ ] BÀN GIAO TIỀN hoàn toàn client state — KHÔNG network write; modal kiểm đếm tính Tổng tiền = Σ(mệnh giá × SL) và đổ vào "Tiền bàn giao"; Chênh lệch tính theo công thức (đầu kỳ + thu tiền mặt − chi tiền mặt − tiền bàn giao) — công thức chốt lúc implement, comment rõ.
- [ ] "Nhận từ" / "Người nhận bàn giao" là select nhân viên (nguồn như Thu ngân/NVBH ở PDR-06).
- [ ] Nút "In bàn giao" và In/Xuất toolbar dùng renderer ở TKT-PDR-08 (ở đây chỉ nối state, có thể tạm stub handler).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] FE strings tiếng Việt; số format `Intl` `vi-VN`.
- [ ] Tuân thủ pos-web CLAUDE.md (import `@erp/ui`, `lucide-react`, `PosDialog`).

## Tech Approach

- Panel = component thuần nhận props số + nhãn; layout Tailwind grid 3 cột.
- `CashCountModal`: mảng mệnh giá constant trong `daily-report.constant.ts`; state `Record<denomination, qty>`; `total = Σ denom*qty`.

## Testing Strategy

- `tsc` build; verify số liệu + kiểm đếm + không network write (network panel) ở TKT-PDR-09.

## Dependencies

- Depends on: TKT-PDR-05
- Blocks: TKT-PDR-08

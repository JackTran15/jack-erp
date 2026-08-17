---
feature: promotion-qa-defects
slug: promotion-qa-defects
owner: Akenzy
created: 2026-08-13
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Sửa 10 lỗi QA đợt khuyến mại

Đợt test khuyến mại trên nhánh `feat/promotions` (QA, 13/08/2026) trả về 10 lỗi. Đây là
feature **sửa lỗi**, không thêm tính năng: mọi thay đổi phải truy được về đúng một lỗi QA đã báo.

Nền tảng đã có sẵn từ ba epic trước — `promotion-programs-engine` (G3, 35/35 ticket),
`checkout-saga` (G3, 38/39), `pos-promotion-apply` (G3, 29/45). Feature này không mở lại phạm vi
của chúng; nó vá những chỗ ba epic đó ghép vào nhau chưa khớp.

## Problem

Ba lỗi đầu là **mất tiền thật**, không phải lỗi hiển thị — `cash_movements` ghi WITHDRAWAL sai số:

- **Hoàn tiền trả hàng theo giá gộp.** HĐ 1.430.000, KM 201.000, khách trả 1.229.000 → trả hàng
  chi ra 1.430.000. Nặng nhất: HĐ 580.000 thanh toán hoàn toàn bằng 1000 điểm (khách trả 0đ) →
  trả hàng vẫn chi 580.000 tiền mặt. Ba lần trả trong một ngày test lệch **862.524đ**.
- **Trần đổi điểm tính trước khi engine KM chạy.** Giỏ 580.000, KM 116.000 (còn 464.000), khách
  đổi 1000 điểm (=500.000) → hệ thống trừ đủ 1000 điểm nhưng `amountDue` bị kẹp về 0.
  **36.000đ giá trị điểm bốc hơi.**
- **Huỷ hoá đơn không trả lại điểm đã dùng.** HĐ đổi 100 điểm, tích 138 → huỷ chỉ thu hồi 138,
  còn `redeem -100` giữ nguyên → khách **mất trắng 100 điểm**. Luồng trả hàng có hoàn điểm,
  luồng huỷ thì không.

Một lỗi làm **cả quầy không bán được**: CTKM "Giảm giá hoá đơn" không hàng hoá lưu được bình
thường, nhưng sau đó mọi lần tính tiền đều 500 INTERNAL_ERROR cho tới khi xoá CTKM đó.

Còn lại là sai dữ liệu và mất niềm tin vào số liệu: hoá đơn khách vãng lai in ra "Điểm được tích
+122" trong khi không thẻ nào được cộng; CTKM ngừng theo dõi hoặc ngoài khoảng ngày biến mất khỏi
dialog không một dòng lý do nên thu ngân không trả lời được khách; CTKM chỉ nhập giờ bắt đầu thì
chạy 24/24; CTKM sinh nhật lưu được mà không bao giờ khớp ai; và báo cáo cuối ngày hiện
**−943.000** trong khi quỹ thực tế **+2.527.000**, với 719.000đ tiền khuyến mại không xuất hiện ở
bất kỳ báo cáo nào.

## Success signal

Chạy lại đúng kịch bản QA của ngày 13/08 và đối chiếu bằng số:

- Báo cáo cuối ngày: Thu tiền mặt **6.497.000**, Chi **3.970.000**, TỔNG **+2.527.000** — khớp
  tuyệt đối với Sổ quỹ tiền mặt (hiện đang lệch −943.000 so với +2.527.000).
- Tiền khuyến mại hiện **719.000** thay vì 0.
- Trả một dòng của hoá đơn có KM: Phiếu chi và `cash_movements` bằng đúng *giá dòng − khuyến mại*.
- `select count(*) from invoices where customer_id is null and points_earned <> 0` → **0**.
- Toàn bộ suite `pnpm --filter @erp/api test` xanh.

## Out of scope

- **`promoCodeCount`** — không phải lỗi lệch bảng như QA chẩn đoán; nó là hằng số
  `promoCodeCount: 0` kèm ghi chú hoãn (`get-pos-daily-summary.handler.ts:132`), hợp đồng ghi rõ ở
  `shared-interfaces/src/invoice-report/pos-daily-summary.ts:45-46`. Cần định nghĩa nghiệp vụ
  trước, không sửa được bằng cách trỏ lại bảng.
- **Backfill số tiền đã sai** (`refunded_amount`, `cash_movements`, Phiếu chi đã POSTED). Dữ liệu
  dev-test; nếu sau này phải sửa số prod thì làm bằng phiếu điều chỉnh, không sửa bản ghi —
  giao dịch đã post là bất biến.
- **`netCashFlow` trộn card/bank/voucher** (lỗi #10c, QA chưa nêu). Ghi nhận nhưng để riêng vì
  sửa sẽ đổi ngữ nghĩa cả báo cáo, vượt phạm vi một đợt vá lỗi.
- Không mở lại thiết kế của `promotion-programs-engine` / `checkout-saga`; không đụng bảng
  `promotions` cũ.

## Constraints

- **Không đổi `invoice_items.line_total`.** QA xác nhận Hàng bán / Hàng trả trong báo cáo đang
  đúng; đổi ngữ nghĩa cột này sẽ vỡ chúng cùng nhiều báo cáo khác. Phân bổ khuyến mại đi vào một
  cột cộng thêm.
- Sửa ở **cả hai luồng checkout** khi lỗi tồn tại ở cả hai (v1 `checkout-invoice.service.ts` và
  v2 saga). Cờ `VITE_CHECKOUT_V2` quyết định luồng nào chạy — phải kiểm cờ này trước khi debug.
- `synchronize: false` — đổi schema chỉ qua migration TypeORM viết tay.
- Backend chỉ tiếng Anh (lỗi, comment, swagger, log); tiếng Việt chỉ ở UI.
- Giao dịch đã post là bất biến; sửa sai bằng bút toán đảo, không sửa bản ghi.

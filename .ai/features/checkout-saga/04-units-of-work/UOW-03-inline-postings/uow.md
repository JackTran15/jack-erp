---
id: UOW-03
slug: inline-postings
title: Kho, bút toán và quỹ ghi trong cùng transaction; Kafka chết không làm hỏng đơn
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-13, AC-16, AC-17, AC-18]
risk: high
status: todo
rollback: gỡ 5 step 14–18 khỏi danh sách đăng ký là quay về hành vi UOW-02; dữ liệu đã ghi vẫn đúng và đầy đủ
---

# UOW-03 — Đưa kho, GL và quỹ vào trong transaction

Đây là lát trả lời đúng câu hỏi của epic. Bốn lệnh ghi hôm nay chạy ở consumer async **sau** commit —
nguồn gốc của lỗi (b), (c), (d), (e) — chuyển vào trong transaction. Sau lát này, "hỏng giữa chừng"
không còn nghĩa là mất dữ liệu, nó chỉ còn nghĩa là `ROLLBACK`.

Bốn service đều đã nhận `manager` và đều được module export, nên **không phải sửa file nào** (ADR-03).
Luồng v2 thôi publish 4 topic cũ; consumer cũ giữ nguyên phục vụ v1, nên không có xử lý hai lần.

## Demo script

1. Bán một đơn có cả dòng tiền mặt và dòng chuyển khoản qua `/v2` → kiểm `stock_ledger_entries` đủ
   dòng `SALE_ISSUE`, `journal_entries` có bút toán bán hàng, `cash_movements` có dòng thu vào quỹ
   chi nhánh, quỹ tiền gửi có bút toán (AC-16).
2. So bút toán vừa sinh với bút toán mà `/v1` sinh trên cùng draft → các chân giống nhau.
3. **Dừng Redpanda** (`docker compose stop redpanda`) rồi checkout tiếp một đơn → request vẫn thành
   công, hóa đơn + kho + bút toán + quỹ đủ, `SELECT * FROM outbox_messages WHERE published_at IS NULL`
   thấy các dòng đang chờ. Bật lại → relay đẩy hết, `published_at` được điền (AC-18).
   Trên luồng cũ, đúng thao tác này sinh ra một hóa đơn PAID không có hệ quả nào.
4. Gỡ cấu hình COA doanh thu để `post-journal` ném → `countBusinessRows` trước/sau **bằng nhau** trên
   cả 8 bảng, counter số hóa đơn không tăng, `checkout_saga` có một dòng FAILED kèm trail tới step 15
   (AC-17, AC-13).
5. Chạy đo p95 v1 và v2 trên cùng bộ dữ liệu, đọc con số (A-09).

## In scope

- Step 14 `deduct-stock`, 15 `post-journal`, 16 `post-cash`, 17 `post-deposit`, 18 `enqueue-outbox`.
- Bỏ 4 lệnh publish thẳng; thay bằng `OutboxService.enqueue(manager, …)` + `dispatchNow()` sau commit.
- Đo hiệu năng để xác nhận hoặc bác bỏ A-09.

## Not in scope

- Khuyến mại (UOW-04) và voucher (UOW-05) — dòng hàng tặng chưa có nên `deduct-stock` mới chỉ trừ
  dòng hàng thường.
- Chuyển POS sang v2 (UOW-05).

## Risks

| Risk | Mitigation |
|---|---|
| Bút toán v2 lệch chân so với bút toán v1 | T-03-02 dựng payload từ đúng `journal-sale.consumer.ts` và so bằng test đối chiếu trực tiếp hai bút toán trên cùng draft |
| Transaction dài hơn gây tranh khoá giờ cao điểm (A-09) | T-03-09 đo p95; đường lùi trong ADR-02 và ADR-03 |
| Vô tình vẫn publish 4 topic cũ → xử lý hai lần | AC-16 khẳng định không có message nào lên 4 topic đó; kiểm bằng spy trên `EventPublisher` |
| `ItemCostSnapshotService.snapshotOne` gọi trong vòng lặp làm chậm | T-03-01 gom lời gọi theo `itemId` duy nhất trước khi dựng movements |
| `awardPointsForInvoice` không nhận `manager` (A-10) | Không cản: ADR-04 vốn đã chọn đẩy EARN qua outbox. T-03-05 chỉ cần xác minh và ghi lại kết luận |

## Definition of done

- [x] AC-13, AC-16, AC-17, AC-18 pass (T-03-07: AC-13/16/17 qua 3 vị trí lỗi thật 14/15/17, đính chính
      so với ghi chú gốc 15/16/17 — xem T-03-07; T-03-08: AC-18)
- [x] Bút toán và dòng kho của v2 khớp v1 trên cùng draft (đã chốt ở T-02-08/T-02-09, tái xác nhận
      xuyên suốt UOW-03 qua mọi lần chạy `expectInvoiceParity`)
- [x] Không message nào lên 4 topic cũ (đóng ở tầng thiết kế/ADR-03 — không import `EventPublisher` ở
      4 step inline, xem đính chính T-03-07)
- [x] Kịch bản tắt Kafka: đơn vẫn đủ hệ quả, outbox còn hàng chờ, bật lại thì trôi hết (T-03-08)
- [x] Con số p95 v1 vs v2 đã đo và ghi lại; A-09 được kết luận (T-03-09, `confirmed`, Akenzy duyệt
      chấp nhận nguyên trạng 2026-08-05)
- [ ] Demoed và accepted at gate G4

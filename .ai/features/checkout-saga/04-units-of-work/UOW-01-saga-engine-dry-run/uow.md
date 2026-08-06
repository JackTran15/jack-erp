---
id: UOW-01
slug: saga-engine-dry-run
title: Chạy thử một đơn qua saga và đọc được trail từng bước, không ghi gì
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: done
rollback: gỡ dòng `CheckoutSagaModule` khỏi `pos.module.ts` là endpoint biến mất; hai bảng mới không ai đọc, `down()` của migration xoá sạch
---

# UOW-01 — Bộ khung saga + trace + dry-run

Lát cắt này dựng đủ bộ khung để *nhìn thấy* luồng chạy: hợp đồng step, orchestrator, hai bảng trace,
5 step preflight, và một endpoint chạy ở chế độ thử. Không có một lệnh ghi nghiệp vụ nào — nên demo
được trên dữ liệu thật mà không sợ hỏng gì.

Step `evaluate-promotion` ở lát này là **stub trả chiết khấu 0**; UOW-04 thay bằng engine thật.

## Demo script

1. Mở POS, tạo một draft 3 dòng hàng cho một khách có thẻ, có chiết khấu tay và điểm đã đổi.
2. `POST /v2/pos/checkout` với `dryRun: true` → trả về 5 step preflight, mỗi step có `seq`, `name`,
   `phase: "preflight"`, `status: "OK"`, `durationMs`; kèm `totals`.
3. Đối chiếu `amountDue` và `pointsEarned` với đúng con số luồng cũ tính (AC-02).
4. Chạy `SELECT count(*)` trên 8 bảng nghiệp vụ + `checkout_saga` trước và sau → không đổi (AC-01).
5. Gỡ cấu hình quỹ tiền mặt của chi nhánh, chạy lại → 400 ngay ở `resolve-funds`, trace cho thấy
   không step transactional nào chạy (AC-03). Đây chính là lỗi (e) của luồng cũ, nay lộ ra sớm.
6. Thử trên một hóa đơn đã PAID, một draft rỗng, một draft có dòng thiếu `locationId` → mỗi ca một
   thông điệp đúng nguyên nhân, trace dừng ở `load-draft` (AC-04).
7. Mở log server → mỗi step một dòng `[checkout-saga][saga=…][corr=…][step=n/5 …][OK] …ms`.

## In scope

- `CheckoutStep` / `CheckoutContext` / `CheckoutTrace` và `CheckoutSagaOrchestrator`.
- Hai bảng `checkout_saga`, `checkout_saga_step` + entity + migration (kèm partial unique index của ADR-05).
- 5 step preflight: `load-draft`, `evaluate-promotion` (stub), `resolve-accounts`, `resolve-funds`,
  `compute-totals`.
- `POST /v2/pos/checkout` (chỉ nhánh `dryRun`) và `GET /v2/pos/checkout/sagas/:id`.
- Logger có cấu trúc.

## Not in scope

- Mọi lệnh ghi nghiệp vụ và mọi step transactional (UOW-02, UOW-03).
- Engine khuyến mại thật (UOW-04), voucher (UOW-05).

## Risks

| Risk | Mitigation |
|---|---|
| Orchestrator phình thành nơi chứa nghiệp vụ | T-01-03 quy định rõ: orchestrator chỉ chạy step, đo giờ, ghi trace, map lỗi — không đọc DB, không tính tiền. Kiểm ở code review |
| `compute-totals` tính lệch so với luồng cũ | Dùng lại đúng `computeAmountDue` từ `services/invoice-amount.util.ts` và hằng `POINT_EARN_VND_PER_POINT`, không tự viết công thức (T-01-05) |
| Dry-run lỡ ghi gì đó | Phase transactional chưa tồn tại ở lát này; AC-01 đếm dòng 9 bảng trước/sau như một chốt chặn |
| Partial unique index sai cú pháp Postgres | T-01-01 chạy `migration:run` rồi `migration:revert` rồi `run` lại trên `erp_test` trước khi đóng ticket (A-13) |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04 pass — e2e thật (T-01-10), 8/8
- [x] Dry-run không ghi một dòng nào vào 9 bảng được đếm — `countBusinessRows` trước/sau, `toEqual`
- [x] Mỗi step sinh đúng một dòng log có `sagaId`, `correlationId`, `seq/total`, tên, kết quả, thời lượng
      — `checkout-trace.logger.spec.ts` (T-01-04), khẳng định bằng regex khớp đúng định dạng
- [x] Orchestrator không import repository nghiệp vụ nào — xác nhận ở T-01-03
- [x] `git diff --stat` cho thấy chỉ các file cũ trong danh sách 5 ngoại lệ bị sửa — hiện tại đúng
      2/5 (`pos.module.ts` 2 dòng, `jest-setup.ts` 8 dòng); 3 ngoại lệ còn lại thuộc UOW-04/05, chưa
      tới lượt
- [x] Demoed và accepted at gate G4

## Kết quả UoW (2026-08-05)

10/10 ticket done. Bảy bước của Demo script ở trên đều đã được chứng minh — không phải qua thao tác
tay trên giao diện POS (không có sẵn trong phiên làm việc này), mà qua đúng các ca tương đương trong
`checkout-saga.e2e-spec.ts` (T-01-10) và `checkout-trace.logger.spec.ts` (T-01-04), tức là chứng cứ
tự động, lặp lại được, và bao phủ đúng những gì bước demo mô tả. Click-through thật trên giao diện POS
vẫn đáng làm khi tiện, nhưng không chặn UoW này.

Ba phát hiện đổi kế hoạch trong lúc thi công, đã ghi vào register: A-17 (e2e dựng schema từ entity),
A-18 (hook timeout), A-19 (đua với outbox relay), A-20 (cột hàng tặng phải khai báo trên entity),
A-21 (hệ quả gộp của ba cái trên), A-22 (service gốc ném lỗi chuỗi thô, phải bọc lại ở biên step),
A-23 (switch-branch thu hồi session gọi nó). Không cái nào đổi kiến trúc đã duyệt; tất cả là chi tiết
thực thi lộ ra khi chạy thật thay vì đọc code.

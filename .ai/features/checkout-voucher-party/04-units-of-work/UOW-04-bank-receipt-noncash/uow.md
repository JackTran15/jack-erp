---
id: UOW-04
slug: bank-receipt-noncash
title: Thanh toán không tiền mặt sinh phiếu thu tiền gửi có đủ đối tượng
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-03]
requirements: [US-04]
verifies: [AC-13]
risk: high
status: todo
rollback: gỡ khối ghi phiếu khỏi consumer và khỏi `post-deposit.step.ts` — Sổ tiền gửi quay lại chỉ có movement như hôm nay
---

# UOW-04 — Phiếu thu tiền gửi cho thanh toán không tiền mặt

Lát cắt cần được đọc kỹ trước khi bắt đầu, vì nó **không giống ba cái trước**. Ba UoW kia
điền ô vào chứng từ đã có. Ở đây chứng từ **chưa từng tồn tại**: `PosDepositSaleConsumer`
(v1) và `post-deposit.step` (v2) đều chỉ ghi `deposit_movements`, không ai tạo `bank_receipts`
(A-08). Chốt một đơn chuyển khoản hôm nay để lại tiền trong sổ mà không để lại phiếu thu nào.

Hệ quả nghiệp vụ phải nói trước với chủ sở hữu: sau UoW này, **mọi** đơn thẻ / chuyển khoản /
ví sẽ sinh thêm một phiếu thu tiền gửi trong Sổ tiền gửi. Đó là thay đổi hình dạng sổ sách,
không phải một bản vá hiển thị. Đây cũng là lý do UoW này xếp cuối và phụ thuộc UOW-03: cắt
bỏ nó không làm gãy ba UoW kia, và nó dùng lại đúng khuôn mẫu voucher-only mà UOW-03 đã
chứng minh là an toàn.

## Demo script

1. Ghi lại phiếu thu cuối cùng trong Sổ tiền gửi và số dư quỹ tiền gửi.
2. POS (v1, tắt `VITE_CHECKOUT_V2`) → bán một món cho khách có địa chỉ → thanh toán **chuyển
   khoản** → chốt.
3. Backoffice → Sổ tiền gửi → có một phiếu thu mới, đủ bốn ô, số tiền đúng dòng thanh toán.
4. Sổ nhật ký chung: số bút toán của hoá đơn đó **không tăng** so với trước UoW này.
5. Bật `VITE_CHECKOUT_V2=true`, lặp bước 2 → cũng có phiếu, cũng đủ bốn ô, cũng không thêm
   bút toán.
6. Đơn trả tiền **hỗn hợp** (một phần tiền mặt, một phần chuyển khoản) → một phiếu thu tiền
   mặt (UOW-01/03) **và** một phiếu thu tiền gửi, tổng hai phiếu bằng tiền khách trả.
7. Gửi lại cùng sự kiện / cùng idempotency key → không sinh phiếu thứ hai.

## In scope

- `documentNumber?` cho `BankReceiptsService.createVoucherForMovement` (đối xứng T-03-01).
- `PosDepositSaleConsumer` tạo `bank_receipts` voucher-only cho movement nó vừa ghi, kèm
  snapshot đối tượng.
- `post-deposit.step.ts` làm điều tương tự inline trong transaction checkout.
- Spec cho cả hai đường, gồm phép đếm bút toán và phép kiểm idempotent.

## Not in scope

- Phí ngân hàng (`DepositFeeService.postFee`) — giữ nguyên, phiếu thu không đụng chân phí.
- Đơn hàng thanh toán bằng điểm hay đặt cọc.
- Phiếu chi tiền gửi hoàn trả — đã xong ở UOW-02.
- Hồi tố phiếu cho các đơn không tiền mặt đã chốt (A-04).

## Risks

| Risk | Mitigation |
|---|---|
| Chủ sở hữu không lường trước rằng đây là **tạo chứng từ mới**, không phải điền ô (A-08) | Ghi rõ ở đầu UoW này và trong `00-intent.md`; UoW xếp cuối, cắt được độc lập |
| Một dòng thanh toán sinh hai phiếu khi event được gửi lại | Dedupe theo `(referenceType, referenceId, sourceRefLineId)` — kiểm `findByReference` của `BankReceiptsService` nhận được khoá đủ mịn ở mức **dòng thanh toán**, không phải mức hoá đơn (khác với cash: một hoá đơn có thể có nhiều dòng không tiền mặt) |
| Gọi `createAndPostInternal` → movement và bút toán thứ hai trên quỹ tiền gửi | Demo bước 4 và phép đếm bút toán trong spec |
| Số phiếu mint ngoài transaction ở đường v2 | Dùng `mintDocumentNumber`, y như ADR-03 |

## Definition of done

- [x] AC-13 xanh cho cả đường v1 (consumer) và v2 (step)
- [x] Đơn hỗn hợp cho đúng hai phiếu, tổng khớp tiền khách trả — e2e, hàng thật
      (`cash_receipts` 40.000 + `bank_receipts` NTTK000001 60.000 = 100.000)
- [x] Số bút toán mỗi đơn không đổi so với trước UoW — e2e đếm, delta = 1
- [x] Gửi lại sự kiện / replay không sinh phiếu thứ hai, kiểm ở mức **dòng thanh toán**
      (dedupe chuyển sang khoá `depositMovementId`, T-04-01)
- [x] `pnpm --filter @erp/api test` xanh (2580 passed)
- [x] ~~Demo script~~ — **KHÔNG chạy**. Sổ tiền gửi chưa được mở lần nào trên dev; phiếu
      `NTTK000001` chỉ tồn tại trong `erp_test` do e2e dựng
- [x] Accepted at gate G4 **không kèm demo** — Akenzy, 2026-08-15

Migration `1788200000000-AddInvoiceBankReceiptReferenceType` đã chạy trên `erp_dev` và (qua
global-setup) trên `erp_test`. Chưa chạy ở đâu khác.

## Verification evidence
- [x] `verify.py --write` xanh 5/5 trên `local-backoffice` — các bước chỉ chạm Sổ quỹ **tiền
      mặt**, không chạm Sổ tiền gửi
- [x] AC-13 **không có ảnh**: cần một đơn chuyển khoản và một quỹ tiền gửi đã cấu hình trên
      dev. Phủ bởi e2e đơn hỗn hợp trên `erp_test` — `NTTK000001`, 60.000, `partner_type
      CUSTOMER`, `collected_by` có giá trị, `journal_entries` không tăng thêm
- [x] Migration `1788200000000` đã chạy trên `erp_dev` và `erp_test`; chưa chạy ở môi trường
      nào khác
- [x] `08-evidence.md` đã sinh lại; commit sha trong `run.json` = `88296e93` = HEAD
- [x] PR draft + `contact-sheet-local-backoffice.png` đã sinh dưới `evidence/`. **Chưa mở PR**
      — công việc còn uncommitted trên `feat/promotions`, nên chưa có gì để đính kèm vào

> **Đóng G4 có ngoại lệ, do Akenzy quyết ngày 2026-08-15.** `evidence_check.py` đòi một ảnh
> chụp cho **mọi** AC trong `verifies:`; 13/15 AC của feature này không có bề mặt UI để chụp
> (bất biến sổ sách, replay, hồi quy test). Ngoại lệ được ghi ở đây thay vì giấu bằng cách
> thu hẹp `verifies:` — kế hoạch giữ nguyên, chỗ hụt nói thẳng.

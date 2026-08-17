---
id: UOW-05
slug: voucher-and-cutover
title: Voucher không tiêu được hai lần, và POS chuyển sang luồng mới bằng cờ
demoable: true
duration: 1d
depends_on: [UOW-04]
requirements: [US-05]
verifies: [AC-21, AC-22]
risk: medium
status: todo
rollback: tắt `VITE_CHECKOUT_V2` là POS quay lại luồng cũ ngay, không cần deploy backend
---

# UOW-05 — Voucher và chuyển đổi

Lát cuối. Voucher là hệ thống riêng, không nằm trong `EvaluateCartResponse`, nên nó là một step riêng.
Vá lỗi (h): hôm nay `apply` và `commitPromotions` là hai transaction cách nhau vài phút nên hai draft
cùng áp một voucher đều checkout được. Đưa việc tiêu voucher vào trong chính transaction thanh toán
làm chuyện đó không xảy ra được nữa — và điều đẹp là `VoucherService.markUsed` vốn đã là một
conditional UPDATE nhận `manager`, nên đúng đắn có sẵn, chỉ cần đặt nó đúng chỗ.

Rồi bật cờ cho POS.

## Demo script

1. Tạo một voucher chưa dùng. Áp nó vào **hai** draft khác nhau ở hai quầy.
2. Bấm thanh toán cả hai gần như cùng lúc → một đơn xong, `vouchers.redeemed_invoice_id` trỏ đúng đơn
   đó; quầy kia nhận 409 và **không có gì được ghi**: không hóa đơn, không bút toán, không trừ kho (AC-21).
3. Làm lại đúng kịch bản đó trên `/v1` → cả hai đều xong, voucher bị tiêu hai lần. Đặt hai kết quả
   cạnh nhau.
4. Bật `VITE_CHECKOUT_V2`, mở POS, bán một đơn thật → request đi tới `/v2/pos/checkout`, hóa đơn in
   ra bình thường. Tắt cờ, bán lại → quay về luồng cũ, hành vi không đổi (AC-22).
5. Mở `GET /v2/pos/checkout/sagas/:id` của đơn vừa bán → đủ 19 bước.
6. Chạy `git diff --stat origin/main` → chỉ 5 file cũ đã thỏa thuận bị sửa, không hơn.

## In scope

- Step 09 `redeem-voucher` + validate voucher ở preflight.
- Cờ `VITE_CHECKOUT_V2` trong `pos-web`.
- Kiểm tra ràng buộc "không sửa code cũ" bằng chứng cứ.

## Not in scope

- `discount_codes` (bảng mã giảm giá cũ) — chỉ voucher. Mã giảm giá cũ vẫn đi đường v1.
- Gỡ `CheckoutInvoiceService`. Việc đó chỉ nên làm sau khi v2 chạy thật một thời gian.

## Risks

| Risk | Mitigation |
|---|---|
| Validate ở preflight rồi tiêu ở transaction vẫn còn khe TOCTOU | Không sao: `markUsed` là conditional UPDATE, 0 dòng là `ConflictException` → rollback. Preflight chỉ để báo lỗi sớm cho ca thường, không phải cơ chế chống đua. Ghi rõ điều này trong code |
| Bật cờ trên máy thật khi p95 chưa đạt | UOW-03 T-03-09 phải có kết luận trước khi ticket T-05-03 bắt đầu |
| Sửa `pos-web` lan rộng hơn dự kiến | A-08 đã xác minh chỉ có một call site; T-05-04 kiểm bằng `git diff --stat` |

## Definition of done

- [x] AC-21, AC-22 pass (AC-21 ở T-05-02, 5 vòng lặp không flake; AC-22 xác nhận bán thật cả hai
      trạng thái cờ ở T-05-04, xem Kết quả kiểm chứng bên dưới)
- [x] Hai quầy tranh một voucher: một thắng, một rollback sạch hoàn toàn (T-05-02)
- [x] Kết quả đối chứng trên `/v1` (voucher bị tiêu hai lần) đã chạy và ghi lại — đính chính quan
      trọng ở A-34/T-05-02: race thật không tái hiện bug (h) trên v1 (v1 đã tự chặn đúng qua cùng
      `markUsed` conditional-update bên trong transaction của chính nó)
- [x] Bật/tắt cờ đổi được endpoint, không cần deploy backend (T-05-04: restart `vite` dev server với
      `VITE_CHECKOUT_V2` true/false, hai lần bán thật đi đúng hai endpoint)
- [x] `git diff --stat` chứng minh ngoài 6 file được phép, không file cũ nào bị sửa (5 ngoại lệ của
      `00-intent.md` + ngoại lệ thứ 4 `vite-env.d.ts` của T-05-03 — xem T-05-04)
- [ ] Demoed và accepted at gate G4

## Kết quả kiểm chứng (2026-08-06, T-05-04)

Xem chi tiết đầy đủ (hai hóa đơn thật, trail 19 bước, kết quả unit+e2e) ở
`04-units-of-work/UOW-05-voucher-and-cutover/tickets/T-05-04.md` §Kết quả kiểm chứng. Tóm tắt: bán thật
trên POS (Chrome) tại chi nhánh Hồ Chí Minh, org `f1000000-0000-4000-8000-000000000001` — cờ bật →
`INV-202608-00001` qua `/v2/pos/checkout`, trail 19/19 bước `OK`; cờ tắt → `INV-202608-00002` qua
`/invoices/:id/checkout` (luồng cũ), mã liền sau (00001→00002, thêm bằng chứng AC-15 trên dữ liệu
thật). Unit 252/252 suite xanh. E2E `checkout-saga.e2e-spec.ts` dao động 16-19/19 tuỳ lần chạy, luôn
cùng nguyên nhân đã truy ra tận gốc (A-35: AC-02 dùng checkout v1 thật làm baseline, side-effect Kafka
bất đồng bộ của v1 đôi khi rơi vào cửa sổ snapshot của AC-03/AC-07 kế tiếp) — không phải hồi quy, mọi
test cốt lõi (parity, AC-10, AC-11/15, AC-13/16/17, promotion, voucher) xanh tuyệt đối qua 4 lần chạy.

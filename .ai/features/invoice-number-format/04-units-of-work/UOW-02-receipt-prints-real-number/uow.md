---
id: UOW-02
slug: receipt-prints-real-number
title: Phiếu in mang đúng số hoá đơn của hệ thống
demoable: true
duration: 1d
depends_on: []
requirements: [US-02, US-03]
verifies: [AC-10, AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: "khôi phục `generateInvoiceNumber` trong `checkoutReceiptFactory.ts` — một hàm 6 dòng, không schema, không hợp đồng API, không dữ liệu phải dọn"
---

# UOW-02 — Phiếu in mang đúng số hoá đơn của hệ thống

Không phụ thuộc UOW-01 về dữ liệu hay hợp đồng: in `invoice.code` là đúng bất kể `code` đang
theo định dạng nào. Chạy song song được, và **đây mới là ticket sửa đúng bug người dùng báo** —
UOW-01 chỉ làm con số đẹp hơn.

## Demo script

1. POS, thêm hàng vào giỏ, bấm **In tạm tính** → phiếu tạm tính ra, **không có dòng `Số:`**
2. Thanh toán với ô "In hóa đơn" bật → phiếu in ra có dòng `Số:` mang một con số
3. Mở **Danh sách hóa đơn**, tìm đúng con số vừa in → hoá đơn hiện ra
4. Mở hoá đơn đó, bấm **In hóa đơn** để in lại → dòng `Số:` **giống hệt** tờ ở bước 2
5. Vào **Đổi trả hàng**, gõ con số đó vào ô tìm hoá đơn → hoá đơn hiện ra trong kết quả
6. Lặp bước 2 với một đơn **trả hàng** → cùng kết quả

Bước 3 và 5 là toàn bộ lý do feature tồn tại: trước khi sửa, cả hai đều không ra gì.

## In scope

- Bỏ hàm sinh số ngẫu nhiên ở client
- Lấy `code` từ response `/checkout` và `/checkout-return` gắn vào biên lai
- Phiếu chưa có số thì ẩn hẳn dòng `Số:`

## Not in scope

- Định dạng của con số (UOW-01)
- Mẫu in trong **Cấu hình → Mẫu in**: `sampleInvoiceDraft.ts` truyền số do người dùng gõ,
  không đi qua đường này
- Các phiếu khác của POS (báo cáo bán hàng, phiếu thu/chi)

## Risks

| Risk | Mitigation |
|---|---|
| Biên lai được dựng **trước** khi gọi API nên lúc dựng chưa có số | ADR-03: dựng không số rồi vá sau mutation, đúng nếp `pointsEarned` đã có sẵn ở `use-checkout-actions.ts:331` |
| Vá sót một trong hai nhánh (bán / trả-đổi) → một nửa số hoá đơn in không số | T-02-03 test cả hai nhánh; hai nhánh nằm cách nhau ~110 dòng trong cùng một hàm |
| Bỏ trường `invoiceNumber` bắt buộc làm vỡ chỗ khác đang dựng `InvoicePayload` | Chuyển thành tuỳ chọn (không bỏ); `sampleInvoiceDraft.ts` và `invoiceRowPrintPayload.ts` vẫn truyền giá trị như cũ |

## Definition of done

- [x] AC-11 và AC-13 có test tự động; AC-10 và AC-12 chờ click-through ở G4
- [x] `grep -rn "Math.random" apps/pos-web/src/lib/page-libs/checkout/` không còn kết quả
- [x] `npx vitest run` trong `apps/pos-web` xanh — 108 test
- [x] `pnpm --filter @erp/pos-web build` xanh
- [x] Demoed và accepted ở gate G4 — click-through thật, `erp2`/`erp_dev`: sau mỗi lần thanh toán
      thật (bán và trả hàng), số hoá đơn xuất hiện đúng trong Danh sách hoá đơn (bước 3) và tìm
      ra ngay trong ô tìm hoá đơn ở Đổi trả hàng (bước 5) — với cả `2608240003/4/5` (bán) lẫn
      `2608240001TH` (trả). Đây chính là bằng chứng cho ADR-03 (số in = `invoice.code` từ response
      thanh toán, không đoán trước): số đó là số THẬT, tra ra đúng hoá đơn — khác hẳn hành vi cũ
      bị báo lỗi (số ngẫu nhiên không tồn tại). Không xác nhận trực quan được khay in native (bước
      2/4 — dialog in của hệ điều hành/trình duyệt không chụp được qua browser automation), nhưng
      cơ chế sinh dữ liệu cho khay in đã được chứng minh đúng qua toàn bộ chuỗi trên.
      Accepted bởi Akenzy, 2026-08-24

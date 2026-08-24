---
id: UOW-03
slug: numbering-settings-page
title: Màn Cấu hình đánh số dựng và xem trước được định dạng mới
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-14, AC-15]
risk: low
status: todo
rollback: "hoàn nguyên hai file DTO và `DocumentNumberingPage.tsx`; rule trong DB không đổi, số vẫn cấp đúng — màn này chỉ là chỗ đọc/sửa cấu hình"
---

# UOW-03 — Màn Cấu hình đánh số dựng và xem trước được định dạng mới

Nếu thiếu UoW này, feature vẫn chạy đúng nhưng màn cấu hình **nói dối**: nó hiện rule hoá
đơn dưới dạng `-YYMMDD-0000` (vì preview hardcode dấu gạch), không có `YYMMDD` trong danh
sách chọn, và API từ chối lưu khi tiền tố rỗng. Lần sau ai đó vào sửa rule là làm hỏng định
dạng mà không hiểu vì sao.

## Demo script

1. Backoffice → **Cấu hình → Đánh số chứng từ**
2. Rule "Hóa đơn" hiện xem trước `YYMMDD0000`, rule "Trả hàng" hiện `YYMMDD0000TH`
3. Rule "Phiếu thu" vẫn hiện `PT000000`, rule "Nhập kho" vẫn `IMP000000` — không đổi
4. Bấm sửa rule "Hóa đơn": ô Tiền tố **trống** và lưu được, ô Định dạng ngày có `YYMMDD`,
   có thêm ô Dấu phân cách đang để trống
5. Đổi Dấu phân cách thành `-` → xem trước đổi thành `-YYMMDD-0000`; đổi lại thành trống →
   `YYMMDD0000`
6. Lưu, không có toast lỗi

## In scope

- DTO create/update: tiền tố cho phép rỗng, thêm `YYMMDD`, thêm `separator`
- Form + xem trước trên `DocumentNumberingPage`

## Not in scope

- Xem trước bằng ngày thật (`2608210001`). Màn này xem trước theo **token** (`INV-YYYYMM-00000`)
  từ trước tới nay; đổi sang render ngày thật là một thay đổi UX riêng, không thuộc câu hỏi #16.
- Ràng buộc "loại chứng từ nào được để tiền tố rỗng" — không có nhu cầu

## Risks

| Risk | Mitigation |
|---|---|
| Nới `@Matches` của `prefix` mở đường cho tiền tố rỗng ở **mọi** loại chứng từ | Đúng ý đồ và vô hại: rule mặc định vẫn có tiền tố; rỗng chỉ xảy ra khi người dùng cố tình xoá |
| Quên `separator` trong response API → form luôn hiện trống rồi ghi đè `''` khi lưu | T-03-01 khẳng định `separator` có trong response `GET /rules` |

## Definition of done

- [x] AC-14 và AC-15 có kiểm ở tầng validator + thuật toán xem trước; xác nhận bằng mắt ở G4
- [x] `pnpm --filter @erp/api test` xanh — 281 suite, 2886 test
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Demoed và accepted ở gate G4 — click-through thật, Backoffice `:3000` → Cấu hình → Đánh số
      chứng từ: rule "Hóa đơn" (toàn tổ chức) hiện mẫu số `YYMMDD0000`, rule "Trả hàng" hiện
      `YYMMDD0000TH`; "Phiếu thu tiền mặt" vẫn `PT000000`, "Phiếu nhập kho" vẫn `IMP000000` —
      không đổi. Mở sửa rule "Hóa đơn": ô Prefix trống hợp lệ, có ô Định dạng ngày = `YYMMDD`,
      có ô Dấu phân cách (trống = dính liền) nhận input `-` bình thường — huỷ không lưu để không
      đụng rule thật. Màn hình còn hiện thêm 3 rule theo chi nhánh do UOW-04 tự nhân bản trong
      phiên demo — đúng như ADR-07 mô tả: dùng lại đúng màn hình này, không cần UI mới.
      Accepted bởi Akenzy, 2026-08-24

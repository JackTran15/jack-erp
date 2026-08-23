---
id: UOW-02
slug: pos-return-grid-document-type
title: Thu ngân phân biệt và lọc được loại chứng từ trên lưới Đổi trả hàng
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-01, US-02]
verifies: [AC-06, AC-07]
risk: low
status: todo
rollback: gỡ cột `Loại` khỏi mảng `columns` trong `ReturnInvoiceTable` — lưới trở về đúng 7 cột như cũ, backend không phải hoàn nguyên gì
---

# UOW-02 — Thu ngân phân biệt và lọc được loại chứng từ trên lưới Đổi trả hàng

## Demo script

Trên POS dev (`:3001`, chạy từ **checkout gốc** — A-14), đăng nhập vào chi nhánh có dữ liệu:

1. Mở `Đổi trả hàng`, chọn khoảng ngày bao trùm một hoá đơn `EXCHANGE` đã post
2. Lưới hiện cả hoá đơn bán lẫn hoá đơn đổi; mỗi dòng có cột **Loại** ghi
   "Bán hàng" hoặc "Đổi trả" (AC-06)
3. Dòng hoá đơn đổi mà cửa hàng đã hoàn tiền cho khách hiện **Tổng thanh toán âm** (AC-07)
4. Chọn "Đổi trả" ở ô lọc cột `Loại` → lưới chỉ còn hoá đơn đổi, chân trang tổng lại
   theo đúng tập đó; chọn "Bán hàng" → chỉ còn hoá đơn bán; chọn "Tất cả" → như bước 2
5. Bấm `Trả hàng` trên một hoá đơn đổi → hộp thoại chỉ liệt kê hàng "Mua thêm"
6. Chọn một dòng, xác nhận → sang tab checkout đổi trả, số tiền hoàn khớp giá đã tính cho
   khách ở lần đổi trước
7. Thanh toán → phiếu trả post thành công; quay lại `Đổi trả hàng`, số lượng còn trả được
   của hoá đơn đổi đó đã giảm

Bước 5–7 là chuỗi khép kín của kịch bản người dùng báo: "đổi 1" → đổi tiếp theo hoá đơn.

## In scope

- `type` chảy từ API xuống dòng lưới, cột `Loại` với nhãn tiếng Việt
- Ô lọc `Loại` bằng `PosSelect` ba lựa chọn, gửi enum lên `searchBody.type`

## Not in scope

- Sửa hộp thoại `ReturnItemsDialog` — nó hiển thị bất kỳ danh sách nào backend trả về,
  và UOW-01 đã lọc còn dòng OUT
- Thêm kiểu lọc thứ ba vào `PosDataTableFilterCell` (ADR-05)
- Màn hình `Lịch sử mua hàng` của khách và hai lưới hoá đơn POS còn lại

## Risks

| Risk | Mitigation |
|---|---|
| Thêm cột làm vỡ bố cục lưới vốn đã nhiều cột | Đặt `Loại` ngay sau `Ngày tạo`, giữ độ rộng nhỏ; kiểm ở viewport 1440×900 (`.ai/aidlc.yaml`) |
| `type` gửi lên bị `ValidationPipe` chặn vì DTO chưa khai báo | T-02-02 phụ thuộc T-01-01, nơi khai báo trường; `forbidNonWhitelisted: true` sẽ trả 400 nếu làm ngược thứ tự |
| pos-web không có runner test thật | `[[reference_pos_web_vitest_works]]` — `npx vitest run` chạy được dù `package.json` để `"test": "echo test"` |

## Definition of done

- [x] AC-06, AC-07 pass — ảnh S1 (cột "Loại": Bán hàng / Đổi trả) và S3
      (`RTN-202607-00001` = **−580.000**, âm chứ không phải 0).
- [x] Demo chạy bước 1–5 trên POS thật ở `:3002`, 1440×900, có ảnh: S1 = bước 2, S3/S4 =
      bước 4 (lọc Đổi trả → 1-7/7 kết quả, Tổng tiền −20.000; lọc Bán hàng → 91.229.000),
      S5 = bước 5 (hộp thoại chỉ chào `SETVOANM-D`, không có `ABA2777-D-38`).
      **Bước 6–7 không chạy** — chúng post một phiếu trả thật, cùng lý do với AC-03 ở UOW-01.
      Kiểm bố cục 8 cột đã làm và **tìm ra khiếm khuyết**: nút "Đổi trả" bị bóp còn 51px,
      tràn mép phải 16px. Gốc rễ là hàng lọc (`PosDataTableFilterCell` đòi 214px/cột), không
      phải cột `Loại` (93px). Chi tiết + số đo + cách sửa: mục "Khiếm khuyết đã biết" trong
      `07-verification.md`. Không chặn thao tác; cần ticket riêng vì đụng component dùng chung.
- [x] `npx vitest run` 100/100, `npx tsc --noEmit` sạch (chạy lại sau khi hoàn nguyên thử
      nghiệm `min-w`).
- [x] Nhãn "Loại" / "Bán hàng" / "Đổi trả" / "Tất cả" đều tiếng Việt; ô lọc dùng `PosSelect`
      từ `@erp/pos/components/common`, tiền vẫn qua `formatVnd` của `@erp/ui`.
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy "please close the feature" 2026-08-23.

## Verification evidence
- [x] `verify.py --write` xanh 5/5 trên `local-pos-worktree` (môi trường duy nhất mà
      `07-verification.md` khai).
- [x] `evidence_check.py` exit 0 — 7/7 AC có bằng chứng ở 1 môi trường × 1 viewport, 4 AC
      khai ngoài phạm vi browser.
- [x] `08-evidence.md` sinh lại sau khi hoàn nguyên, sha khớp HEAD `c5143a9e`. Cây làm việc
      bẩn lúc chụp — đúng như mong đợi, toàn bộ feature còn uncommitted.
- [x] Chưa có PR nào để đính — feature còn uncommitted trên `object-by-branch`. Bản nháp PR
      và contact sheet đã sinh sẵn ở `08-evidence.md` +
      `evidence/contact-sheet-local-pos-worktree.png`, dùng khi mở PR.

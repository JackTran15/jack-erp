---
id: UOW-04
slug: rearrange-after-untrack
title: Xếp vị trí sang kệ mới được ngay sau khi ngừng theo dõi kệ cũ
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-18, AC-19, AC-20, AC-21, AC-22]
risk: low
status: todo
rollback: revert các file api của UOW; không migration
---

# UOW-04 — Xếp vị trí sang kệ mới sau khi ngừng theo dõi kệ cũ

Thêm chặn `is_tracked` vào đúng chỗ đọc bị sót — `resolveAssignedLocation` (ADR-04). Dialog và `arrange`
không đổi: backend xếp vị trí đã bật lại dòng tồn và dời liên kết.

## Demo script

Môi trường `local-backoffice`, tổ chức My Company, header **"Chi Nhánh Long Xuyên"**, DB `erp_dev_3008`.

1. Kho hàng > Chi tiết vị trí hàng hóa, lọc SKU `ABA2777-D-38`, Trạng thái "Tất cả" → dòng A01.02 "Ngừng theo dõi".
2. Vị trí hàng hóa > "Xếp vị trí hàng hóa": ABA2777-D-38, Kho "Kho Long Xuyên", Vị trí một kệ khác A01.02
   (vd A01.03) → "Lưu" → toast thành công. (Trước khi sửa: "Hàng hoá đã ở vị trí A01.02…".)
3. Chi tiết vị trí: (ABA2777-D-38, A01.03) "Đang theo dõi"; A01.02 vẫn "Ngừng theo dõi".
4. Ngừng theo dõi dòng A01.03 vừa có (tồn 0) → xếp lại ABA2777-D-38 vào A01.03 → dòng A01.03 "Đang theo dõi" trở
   lại, không có dòng A01.03 thứ hai.
5. Ca vẫn chặn: `ABA2799-D-38` (kệ A01.03, đang theo dõi, tồn 0) → xếp sang kệ khác → vẫn toast "Hàng hoá đã ở vị
   trí A01.03. Mỗi hàng hoá chỉ được ở 1 vị trí — hãy ngừng theo dõi vị trí cũ trước khi xếp sang vị trí mới."
6. Nhập kho > tạo phiếu: chọn ABA2777-D-38 sau bước 4 lần ngừng theo dõi, Kho "Kho Long Xuyên" → ô Vị trí không tự
   điền kệ đã ngừng (A-10).

## In scope

- `ItemStorageLocationService.resolveAssignedLocation` chặn dòng tồn đã ngừng theo dõi.
- `ProductModule` đăng ký `StockBalanceEntity`.
- Test resolver và test hồi quy `arrange` bật lại dòng tồn đã ngừng.

## Not in scope

- `ArrangeLocationDialog.tsx` và `inventory-location-stock.service.ts` (mã chạy).
- Xoá hoặc dời liên kết khi ngừng theo dõi.

## Risks

| Risk | Mitigation |
| --- | --- |
| Spec khác dựng `ItemStorageLocationService` bằng provider thật sẽ thiếu token repository mới | T-04-01 grep mọi nơi dựng service và chạy các spec đó |
| Form Nhập kho thôi tự điền kệ đã ngừng (A-10) | Hành vi mong muốn; demo bước 6 xác nhận |

## Definition of done

- [x] AC-18 … AC-22 pass
- [x] `pnpm --filter @erp/api test -- item-storage-location.service.spec.ts inventory-location-stock.service.spec.ts` xanh (mốc resolver 23/23)
- [x] Không có thay đổi nào trong `apps/backoffice-web/`
- [x] Demo script chạy đầu-cuối và được nghiệm thu ở G4 — Akenzy nghiệm thu khi đóng plan ngày 11/09/2026; bước 4 và 6 không chạy trên trình duyệt, demo dùng dữ liệu MT46

Trạng thái 2026-09-11: T-04-01 và T-04-02 đã được Akenzy accept. Chạy lại hai spec: 95/95 (26 resolver + 69
location-stock). AC-19 … AC-22 đã có test đơn vị. Review còn để ngỏ khoảng hở của A-09 (mặt hàng đang theo dõi ở kệ khác cùng kho).

### Demo 2026-09-11 (Chrome của Akenzy, backoffice local :3000, DB `erp_dev_3008`, tổ chức MT, header "Chi nhánh MT46 Đà Nẵng")

Migration `AddStorageDefaultIssuing1789920000000` đã được áp (Akenzy cho phép) trước khi chạy. Phiên trình duyệt thuộc
tổ chức MT, nên dùng dữ liệu Kho MT46 thay cho fixture Long Xuyên trong demo script:

| Bước demo script | Chạy thay bằng | Kết quả |
| --- | --- | --- |
| 1–3 (AC-18) | AKHD04-D-44: kệ liên kết Y01.01 đã ngừng theo dõi (tồn 0, là dòng tồn duy nhất của mặt hàng trong Kho MT46) → xếp sang C01.01 | Toast "Đã xếp 1 hàng hóa lên vị trí.". DB sau: có dòng C01.01 tồn 0 **đang theo dõi**, liên kết chuyển sang C01.01 (09:48:12), Y01.01 vẫn **ngừng theo dõi**, không đổi từ 14/08 |
| 5 (AC-20) | AK119236-1-DO-37: kệ liên kết Y12.01 đang theo dõi → xếp sang C01.02 | Toast lỗi "Hàng hoá đã ở vị trí Y12.01. Mỗi hàng hoá chỉ được ở 1 vị trí — hãy ngừng theo dõi vị trí cũ trước khi xếp sang vị trí mới.", dialog giữ nguyên. DB sau: vẫn liên kết Y12.01, không có dòng C01.02 |
| 4 (AC-19) | Không chạy trên trình duyệt | Phủ bằng test đơn vị của T-04-02 |
| 6 (A-10, phiếu nhập kho) | Không chạy | — |

AC-21, AC-22 phủ bằng test đơn vị của T-04-01. Ảnh: `claude-chrome-screenshots-OQwVOz/screenshot-1789120096791-7.jpg`
(AC-18), `claude-chrome-screenshots-OQwVOz/screenshot-1789120201721-8.jpg` (AC-20).

Bước 4 và 6 chưa chạy trên trình duyệt, và demo dùng dữ liệu MT46 thay cho fixture đã ghi trong script. Akenzy chọn bỏ
qua bước 4 và 6, rồi nghiệm thu và đóng plan ngày 11/09/2026.

---
id: UOW-02
slug: quick-image-update
title: Tiện ích → Cập nhật ảnh nhanh — thả file đặt tên theo SKU, gắn hàng loạt
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17]
risk: medium
status: todo
rollback: Revert các commit của UoW. Endpoint `resolve-image-names` biến mất; ảnh đã gắn vẫn hợp lệ. Sinh lại `schema.ts` nếu đã commit bản có endpoint này
---

# UOW-02 — Tiện ích → Cập nhật ảnh nhanh

## Demo script
1. Hàng hoá → Tiện ích → **Cập nhật ảnh nhanh**; đầu trang ghi đúng ba ghi chú quy tắc đặt tên và định dạng cho phép
2. Thả 6 file: `AAA-MEDIA-A (01).png`, `AAA-MEDIA-A (02).png`, `AAA-MEDIA-B.png`, `aaa-media-a-den-39.png`, `KHONG-CO.png`, `to-3mb.png` → sáu thẻ với đúng chú thích (AC-11), tiêu đề "Cập nhật 4/6 ảnh", tab Network chưa có `/media/uploads`
3. Trên thẻ `KHONG-CO` bấm **Đổi ảnh** → chọn `AAA-MEDIA-C.png` → thẻ đổi thành "Hàng hóa AAA-MEDIA-C", tiêu đề "5/6"
4. Thả thêm `AAA-MEDIA-A (01).jpg` → thẻ mới báo trùng STT 01 (AC-16)
5. Bấm **Cập nhật** → nút vô hiệu, các thẻ chuyển lần lượt sang "Đã cập nhật"; toast "Đã cập nhật 5/7 ảnh"
6. Mở form Sửa của A → đúng 3 ảnh theo thứ tự (01), (02), ảnh biến thể; B và C mỗi cái 1 ảnh
7. (Sau khi ép hạn mức bằng seed 100 dòng `UPLOADED` cho user) thả 1 file hợp lệ → Cập nhật → thẻ báo "Hết hạn mức tải lên trong ngày" (AC-14)
8. `pnpm --filter @erp/api test -- parse-image-file-name resolve-image-names` và `test:e2e -- resolve-image-names` → xanh

## In scope
- `parseImageFileName` + `POST /v2/inventory-items/resolve-image-names` (ADR-03)
- Trang `/admin/inventory-items/images/quick`: thả/chọn file, thẻ, Đổi ảnh, bỏ thẻ, bộ đếm, Cập nhật (ADR-04), chặn rời trang
- Mục menu "Cập nhật ảnh nhanh" trong Tiện ích
- Sinh lại `schema.ts` + `openapi.snapshot.json` cho cả ba endpoint; `07-verification.md`

## Not in scope
- Ghép theo slot / giữ ảnh cũ (A-02 đã chốt thay toàn bộ)
- Nới hạn mức media (A-04)
- Nén ảnh phía client

## Risks

| Risk | Mitigation |
| --- | --- |
| Người dùng thả 1.500 file: 1.500 `objectURL` + thẻ ⇒ tab nặng | Thẻ ảnh dùng `loading="lazy"`, `objectURL` được revoke khi bỏ thẻ; NFR "200 file không treo" đo ở T-02-03; không giới hạn cứng số file |
| Một file của mẫu mã lỗi giữa chừng ⇒ bộ ảnh thiếu | ADR-04: không gọi `set-images` cho owner nếu bất kỳ file nào của nó tải lỗi; thẻ báo lỗi, chạy lại sau |
| Trùng STT chỉ phát hiện phía server trong cùng lượt gọi, còn thả thêm là lượt gọi khác | Client giữ map `ownerId→seq` của các thẻ đang có và đánh dấu `DUPLICATE_SEQ` trước khi hiển thị (AC-16) |
| `IdempotencyInterceptor`: cùng khoá + body khác ⇒ 409 | Khoá derive từ `(ownerId, imageIds đã sắp)` như `operationKey`; mỗi lô một khoá |

## Definition of done
- [x] AC-11..AC-17 pass
  - 2026-09-16: AC-11/15/16 `verify-t0202.py`; AC-12/16 e2e `resolve-image-names` 13/13 + spec 28; AC-13/14/17 `verify-t0203.py`, `verify-t0203b.py` (kết quả trong done-when T-02-02/T-02-03).
- [x] `parseImageFileName` spec phủ: có/không đuôi, `(1)`/`(01)`/`(10)`, `(00)`/`(11)`, không khoảng trắng trước ngoặc, tên chỉ có `(01)`, đuôi hoa `.PNG`
  - 2026-09-16: `parse-image-file-name.spec.ts` 19 ca, gồm cả `ABC (1) (2)` và `A B (03)`.
- [x] Thả 200 file ảnh 100 KB trên Chrome: trang vẫn phản hồi, số request `/media/uploads` đồng thời ≤ 3 (tab Network)
  - 2026-09-16: 206 thẻ sau 0,23 s, cuộn 105 ms (`verify-t0202.py`); đỉnh đồng thời 3/3 trong lượt 5 file và lượt AC-13 (`verify-t0104.py`, `verify-t0203.py`).
- [ ] `pnpm openapi:generate` chạy với API dev; `schema.ts` + snapshot commit, `git diff --stat` chỉ gồm ba endpoint mới
  - 2026-09-16: đã sinh, diff chỉ 3 endpoint / 11 DTO, 0 dòng xoá (T-02-04). Chờ commit.
- [x] `pnpm --filter @erp/api test` và `pnpm --filter @erp/backoffice-web build` xanh
  - 2026-09-16: unit 402/402 suite, 5545 pass (chạy sau T-01-04, trước T-02-01 — T-02-01 thêm 2 suite xanh 28/28); backoffice build xanh sau T-02-03 và sau khi sinh lại api-client.
- [ ] Demo và nghiệm thu tại gate G4

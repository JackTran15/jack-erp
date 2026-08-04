---
id: UOW-06
slug: voucher-management
title: Marketing phát hành và theo dõi thẻ voucher với dòng tổng cộng đúng
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-06]
verifies: [AC-24]
risk: low
status: in_progress
rollback: migration `ExtendVouchers` có `down()` gỡ 3 cột; màn voucher quay lại trạng thái ẩn bằng cách comment lại NavChild
---

# UOW-06 — Thẻ voucher end-to-end

Khác chương trình khuyến mại, voucher **không** cần clean architecture — nó là CRUD phẳng một
bảng, giữ ở tầng service như phần còn lại của repo; chỉ search dùng CQRS vì cần lọc theo cột.

Bảng `vouchers` đã tồn tại nhưng thiếu 3 trường FE cần (`issuer`, `description`, `status`) và
`valid_from`/`valid_to` đang `NOT NULL` trong khi FR-051 cho phép bỏ trống.

## Demo script

1. Bỏ comment NavChild `/promotions/vouchers` → mục `Thẻ voucher` hiện trong menu.
2. Mở màn, bấm `Thêm mới` → dialog 6 trường (Ngày bắt đầu, Ngày kết thúc, Nhà phát hành, Voucher,
   Mệnh giá, Mô tả) kèm ghi chú *"Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian"*.
3. Tạo 3 voucher mệnh giá khác nhau, bỏ trống cặp ngày ở một cái → lưu được.
4. Lưới hiện đủ 10 cột; **dòng tổng cộng** ba cột số khớp tổng của toàn tập kết quả lọc, không
   phải chỉ trang hiện tại.
5. Lọc theo `Nhà phát hành` → dòng tổng cộng đổi theo tập đã lọc.
6. Tạo voucher trùng mã → lỗi 409 hiện **tại trường** `Voucher`.
7. Chọn một dòng → `Nhân bản` (mã để trống, chờ nhập) và `Xóa`; ba nút giữa disabled khi chưa
   chọn dòng.

## In scope

- Migration `ExtendVouchers` + entity + `CreateVoucherDto` mở rộng.
- `SearchVouchersV2Query` + `voucher-v2.controller.ts` (search, create, update, duplicate, xóa mềm).
- `VouchersPage` bỏ mock, `VouchersTable` có dòng tổng cộng, `VoucherFormDialog` mới, mở NavChild.

## Not in scope

- `PromotionApplyService` và luồng apply voucher hiện tại — lớp legacy, epic POS xử lý (ADR-04).
- Phát hành voucher theo lô (A-16).

## Risks

| Risk | Mitigation |
|---|---|
| `VoucherService.validate` hiện so sánh `validFrom`/`validTo` **không kiểm null** → voucher vô thời hạn bị từ chối sau khi cột thành nullable | Sửa bắt buộc trong T-06-01, kèm unit test với hai giá trị null (không phải drive-by refactor) |
| Dòng tổng cộng tính nhầm trên trang hiện tại thay vì toàn tập lọc | `summary` tính ở server trên toàn tập kết quả lọc, FE chỉ hiển thị (T-06-01, T-06-02) |
| Trùng mã trả 500 thay vì 409 | Bắt lỗi unique `uq_voucher_org_code` và ném `ConflictException` (T-06-01) |

## Definition of done

- [ ] AC-24 pass
- [ ] `voucher.service.spec.ts` hiện có vẫn xanh sau khi `validFrom`/`validTo` thành optional
- [ ] Không còn `_mock/mock-vouchers.ts` trong repo
- [ ] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4

---
id: UOW-04
slug: promotion-form-five-types
title: Marketing nhập được cả 5 hình thức trên form thật và thấy lỗi đúng chỗ
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-02, AC-11, AC-27, AC-30]
risk: medium
status: todo
rollback: form quay lại chế độ chỉ render `PromotionInvoiceDiscount` bằng một commit revert; không có thay đổi schema
---

# UOW-04 — Form CTKM 5 hình thức

Năm variant đã dựng xong từ trước (`PromotionInvoiceDiscount`, `PromotionProductDiscount`,
`PromotionTieredDiscount`, `PromotionGift`, `PromotionBuyGet`) nhưng `ProgramFormPage` **luôn
render variant đầu tiên** bất kể `type`, và 4/5 option trong `PROMOTION_FORM_OPTIONS` đang bị
comment. UoW này nối chúng lại và cho nút Lưu gọi API thật.

## Demo script

1. Ở `/promotions/programs`, bấm `Thêm mới` → dropdown liệt kê đủ **5** hình thức.
2. Chọn `Giảm giá theo mức` → form render đúng `PromotionTieredDiscount`, không phải giảm giá
   hóa đơn (AC-27).
3. Bỏ trống Tên chương trình rồi bấm Lưu → lỗi hiện **tại trường** Tên, không phải toast chung
   (AC-02).
4. Điền đủ, bỏ trống Ngày kết thúc → hiện cảnh báo xác nhận, xác nhận thì vẫn lưu được (AC-30).
5. Vào tab `Điều kiện áp dụng`, chọn một điều kiện → checkbox `Tự động áp dụng` **giữ nguyên**
   trạng thái đã tick (AC-11).
6. Lưu, quay lại danh sách, mở CTKM vừa tạo ở chế độ Sửa → mọi trường round-trip đúng; control
   chọn hình thức bị vô hiệu hóa; radio trạng thái xuất hiện (chỉ ở chế độ Sửa).
7. Lặp bước 2–6 cho cả 5 hình thức, chụp màn hình `TIERED_DISCOUNT` và `BUY_M_GET_N`.

## In scope

- Wire `?type=` → render đúng 1 trong 5 variant; mở 4 option đang comment.
- `handleSave` / `handleSaveAndNew` gọi mutation thật qua mapper; gắn `issues[]` vào đúng trường.
- Ô nhập `priority`; sửa `PromotionStatus` cục bộ về 2 giá trị; radio chỉ hiện ở chế độ Sửa.
- Chế độ sửa và nhân bản; cảnh báo khi thiếu ngày kết thúc.

## Not in scope

- Dialog chọn hàng hóa cho các lưới (UOW-05).
- Dựng UI cho `tierBasis = ITEM_VALUE`/`INVOICE_VALUE` (A-22) — giới hạn phạm vi đã chấp nhận.

## Risks

| Risk | Mitigation |
|---|---|
| Không có test runner FE nên lỗi chỉ lộ khi click tay | Logic dễ mất dữ liệu đã nằm trong mapper có test (T-03-03); click-through bắt buộc, kèm ảnh chụp 2 hình thức phức tạp nhất (A-24) |
| `PromotionStatus` FE 3 giá trị gửi lên API chỉ hiểu 2 → filter và lưu sai | T-04-03 thay bằng enum 2 giá trị từ `@erp/shared-interfaces`, badge "Đã kết thúc" tính ở client (A-13) |
| Có `useEffect` ngầm tự bỏ tick `autoApply` như MISA | T-04-01 đọc `AutoApplyCheckbox` và xác nhận không có side-effect nào set lại `autoApply` |
| `discountValue` rỗng bị mapper fallback về `0` thay vì báo lỗi | T-04-02 validate bắt buộc nhập ở form trước khi cho Lưu, không dựa vào fallback |

## Definition of done

- [ ] AC-02, AC-11, AC-27, AC-30 pass
- [ ] Tạo → lưu → mở lại đủ **cả 5 hình thức**, đối chiếu từng trường
- [ ] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Ảnh chụp màn hình cho `TIERED_DISCOUNT` và `BUY_M_GET_N` đính kèm PR
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4

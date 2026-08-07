---
id: UOW-06
slug: manual-invoice-discount
title: Giảm giá tay mức hoá đơn, bắt buộc lý do
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-07]
verifies: [AC-23, AC-24]
risk: medium
status: todo
rollback: ẩn nút "Khuyến mại khác" ở POS; cột `manual_discount_reason` để lại null, không migration ngược
---

# UOW-06 — Giảm giá tay mức hoá đơn, bắt buộc lý do

Trên MISA đây là **"Khuyến mại khác"**: %/VNĐ, các mức gợi ý 5/10/15/20/30/50%, **ô lý do bắt
buộc**, và radio phạm vi `Tất cả hàng hóa trong hóa đơn` | `Chỉ hàng hóa chưa áp dụng khuyến mãi`.
Kết quả hiện thành một dòng riêng ở mức hoá đơn với nhãn *"Giảm giá trực tiếp - {lý do}"*.

Đo trực tiếp trên MISA ngày 06/08/2026, phạm vi là thứ quyết định con số chứ không phải chi tiết
trang trí: cùng 10% trên cùng hoá đơn cho ra **104.650** (tất cả hàng) hay **18.000** (chỉ hàng
chưa KM). Chọn nhầm phạm vi là sai tiền, nên đây là phần phải test kỹ nhất của UoW.

Giá trị nghiệp vụ nằm ở chỗ **bắt buộc lý do**: hiện nhân viên muốn giảm giá cho khách quen thì
thương lượng ngoài hệ thống, không ai truy được ai giảm bao nhiêu vì sao.

## Demo script

1. POS: dựng giỏ có **hai** dòng — A `TX1850` giá 1.850.000 chưa có KM, B `NON180` ×3 đang
   có CTKM giảm 20% (540.000 → 432.000). Tổng tiền 2.282.000
2. Mở menu quà tặng → **Khuyến mại khác**
3. Nhập 10%, để trống ô lý do, bấm Đồng ý → **bị chặn tại chỗ**, Network không có request nào
4. Nhập lý do "Khách quen", chọn phạm vi **Chỉ hàng hóa chưa áp dụng khuyến mãi** → Đồng ý
5. Panel hiện dòng "Khuyến mại (10%) 185.000" — bằng 10% của 1.850.000, **không** phải
   228.200 tức 10% của 2.282.000
6. Đổi phạm vi sang **Tất cả hàng hóa** → số đổi thành 228.200
7. Bấm Thu tiền; mở DB: `invoices.discount_amount` = 185.000 và
   `invoices.manual_discount_reason` = "Khách quen"
8. Mở lại hoá đơn ở POS: dòng giảm giá tay hiện kèm lý do

## In scope

- Migration thêm `invoices.manual_discount_reason`
- `ManualDiscountInput` trên **cả** `EvaluateCartDto` và `CheckoutV2Dto` (ADR-02)
- Engine áp giảm giá tay đúng theo phạm vi
- Form ở POS với lý do bắt buộc; hiển thị ở panel và trên hoá đơn đã chốt

## Not in scope

- Nhiều khoản giảm giá tay trên một hoá đơn (ADR-04: tái dùng một cột `discount_amount`)
- Giảm giá tay ở mức **dòng** — `EvaluateCartDto` đã có `manualLineDiscount`, là bài toán khác
- Phân quyền riêng cho việc giảm giá tay (ví dụ giới hạn % theo vai trò) — cần thiết kế hạn mức,
  đủ lớn cho feature riêng

## Risks

| Risk                                                                                                  | Mitigation                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Cơ sở tính của phạm vi `NOT_DISCOUNTED` dễ hiểu nhầm thành "trước khi trừ KM" thay vì "chỉ các dòng chưa có KM" | T-06-03 dùng đúng mốc số đo được trên MISA (185.000 vs 228.200) làm case test, không tự nghĩ số                       |
| `discount_amount` đang được luồng khác dùng ⇒ ghi đè nhau                                             | T-06-01 kiểm ai đang ghi cột đó trước khi tái dùng; nếu đã có người dùng thì đổi sang cột riêng và cập nhật ADR-04     |
| Giảm giá tay cộng dồn với CTKM thành âm tiền                                                          | T-06-03 kẹp kết quả về ≥ 0 và có case test cho trường hợp giảm 100%                                                    |

## Definition of done

- [ ] AC-23, AC-24 pass theo Demo script
- [ ] Không có đường nào tạo được khoản giảm giá tay không lý do, kể cả gọi API trực tiếp
- [ ] Hai phạm vi cho ra đúng 185.000 và 228.200 trên cùng giỏ hàng
- [ ] Migration chạy được và revert được
- [ ] `pnpm --filter @erp/api test` và `test:e2e` xanh; `tsc --noEmit` của `pos-web` sạch
- [ ] `pnpm openapi:generate` đã chạy, snapshot + `schema.ts` đã commit
- [ ] Demoed và accepted ở gate G4

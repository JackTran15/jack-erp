---
id: UOW-01
slug: exchange-consumes-temp-warehouse
title: Đơn đổi trả tiêu thụ kho tạm như đơn bán
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: low
status: done
rollback: revert đúng một khối publish trong `CheckoutReturnService.fanOutEvents`; không có migration, không đổi lược đồ, không đổi hợp đồng HTTP
---

# UOW-01 — Đơn đổi trả tiêu thụ kho tạm như đơn bán

## Demo script

1. Trên backoffice, mở màn hình Chuyển kho tạm của chi nhánh thử nghiệm, chọn kho xuất và
   showroom nhập, thêm một dòng cho SKU thử nghiệm số lượng 1. Để nguyên, **không** bấm
   "Xử lý chuyển kho".
2. Ghi lại tồn showroom hiện tại của SKU đó trên báo cáo Tổng hợp tồn kho.
3. Trên POS, mở Đổi trả hàng, chọn một hóa đơn cũ, trả một mặt hàng bất kỳ, rồi bấm
   "Mua thêm" chọn đúng SKU ở bước 1 số lượng 1. Thanh toán.
4. Quay lại màn hình Chuyển kho tạm với "Hiển thị dòng cần kiểm tra" đang tích → dòng ở
   bước 1 **đã biến mất** khỏi danh sách. Bỏ tích → dòng đó hiện lại, cột "Chuyển kho" là
   **số hóa đơn đổi trả** vừa lập chứ không phải ô tick.
5. Mở lại báo cáo Tổng hợp tồn kho → tồn showroom của SKU **không giảm** so với bước 2
   (bị trừ 1 rồi được bù 1), tồn kho nguồn giảm đúng 1.
6. Đối chứng hồi quy: lặp lại bước 3 với một SKU **không** có dòng kho tạm nào → hóa đơn vẫn
   ghi sổ bình thường, không có phiếu chuyển kho nào sinh ra.

## In scope

- Một lượt phát `TEMP_WAREHOUSE_INVOICE_FULFILL` trong fan-out sau commit của
  `CheckoutReturnService`, gộp theo `itemId` trên các dòng `direction = OUT`.
- Unit test cho: có dòng OUT thì phát, không có dòng OUT thì không phát, gộp đúng, số lượng dương.
- Kiểm chứng chạy thật trên POS + màn hình Chuyển kho tạm.

## Not in scope

- Vá dữ liệu quá khứ (ADR-02).
- Sửa bất cứ thứ gì trong `TempWarehouseService`, consumer, materializer hay phía FE — chúng
  đã đúng, chỉ là chưa từng nhận được sự kiện.
- Chuyển fan-out của đổi trả sang outbox (ADR-03).
- Đảo phiếu chuyển khi hủy đơn đổi trả (A-09).

## Risks

| Risk | Mitigation |
|---|---|
| Gửi số lượng âm khiến `take = Math.min(need, qty)` ≤ 0 và im lặng không làm gì (A-06) | AC-05 có test riêng khẳng định payload mang số dương |
| Phát cả dòng IN làm tiêu thụ nhầm hàng khách vừa trả | Lọc `direction = OUT` là điều kiện đầu tiên; AC-04 có test cho hóa đơn trộn cả hai chiều |
| Trùng `eventId` với hóa đơn bán gốc làm sự kiện bị nuốt (A-04) | Hóa đơn đổi trả là bản ghi `invoices` riêng, UUID riêng; đã kiểm ở G1 |

## Definition of done

- [x] AC-01..AC-07 đều đạt
- [x] `pnpm --filter @erp/api test -- checkout-return.service.spec.ts` xanh
- [x] Toàn bộ unit test của @erp/api xanh, không hồi quy
- [x] Không đụng file sinh tự động (`packages/api-client`), không cần chạy lại `openapi:generate`
- [x] Mã nguồn backend mới viết tiếng Anh
- [x] Demo script chạy thật và được chấp nhận ở gate G4

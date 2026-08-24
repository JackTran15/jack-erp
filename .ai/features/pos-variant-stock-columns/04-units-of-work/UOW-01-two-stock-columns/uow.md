---
id: UOW-01
slug: two-stock-columns
title: Hai cột tồn trong dialog hiện số thật
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12]
risk: medium
status: todo
rollback: revert 2 trường mới khỏi `PosProductVariantDto` và trả `VariantRow` về `0` cứng + `sellableQuantity` — không có migration, không có dữ liệu ghi, nên revert là thuần code
---

# UOW-01 — Hai cột tồn trong dialog hiện số thật

## Demo script

1. Đăng nhập POS (`localhost:3001`), chọn chi nhánh **Hồ Chí Minh**
2. Ở lưới hàng hoá, bấm vào một product có nhiều biến thể và có tồn ở ≥ 2 chi nhánh
3. Trong dialog, cột **Tồn cửa hàng khác** hiện số thật (không còn là `0` ở mọi dòng)
4. Mở backoffice → báo cáo tồn kho, lọc đúng biến thể đó, cộng tay tồn của **Hà Nội +
   CCC** → khớp đúng con số ở bước 3
5. Cột **Tồn kho** hiện số dư kho showroom chính của **Hồ Chí Minh**; nếu biến thể có
   tồn showroom âm, dialog hiện đúng số âm chứ không hiện `0`
6. Tick chọn một dòng có `Tồn kho = 0` nhưng đang có hàng ở kho tạm, nhập SL = 1 →
   **không** có badge đỏ (ngưỡng cảnh báo vẫn là tồn dự phóng, ADR-02)
7. Mở DevTools → Network, đóng và mở lại dialog → đúng **một** lời gọi
   `catalog/products/:id`, không có request nào khác

## In scope

- `loadDetailStockExtras` — truy vấn + gộp nhóm trên RAM cho `mainShowroomQuantity` và
  `otherBranchQuantity`
- Hai trường mới trên `PosProductVariantDto`, nối vào cả đường PRODUCT và đường ITEM
- Render hai cột trong `VariantRow`, giữ nguyên biểu thức cảnh báo trên `sellableQuantity`
- Test đơn vị cho logic tổng hợp; test chống N+1; bằng chứng trình duyệt

## Not in scope

- Tooltip phân rã theo kho (UOW-02) — cột `Tồn kho` ở slice này là một con số trần
- Thẻ catalog ngoài lưới, dòng giỏ hàng (A-06)

## Risks

| Risk | Mitigation |
|---|---|
| Sửa nhầm `loadBranchStock` → hồi quy `sellableQuantity` của hai feature trước | ADR-01: phương thức đó không được chạm; T-01-04 khoá lại bằng test đọc `sellableQuantity` trên đúng kịch bản kho tạm |
| Định nghĩa showroom (`is_main_showroom`) lệch với tập kho POS thực trừ (A-03) | T-01-04 viết test nói rõ ràng buộc này, để ngày hai tập lệch nhau thì test đỏ trước |
| Truy vấn org-wide làm chậm lúc mở dialog (A-11) | T-01-05 đếm số lượt đọc; truy vấn hẹp theo `item_id IN (…)`, dùng prefix unique index |
| Quên nhánh ITEM (hàng lẻ) — `buildItemDetail` là đường riêng | T-01-02 nối cả hai nhánh; T-01-03 có case hàng lẻ standalone |

## Definition of done

- [x] AC-01 … AC-07, AC-09 … AC-12 pass — AC-01/02/03/04/05 phủ bởi unit test
      (`loadDetailStockExtras` describe block); AC-06/AC-07 phủ bởi test + xác nhận sống
      (`07-verification.md` Ảnh 1); AC-09 phủ bởi test "leaves mainShowroomQuantity at 0...";
      AC-12 xác nhận sống bằng Network tab — đúng 1 `GET catalog/products/:id` (+1 `OPTIONS`
      preflight, không tính) khi đóng/mở lại dialog
- [x] `loadBranchStock` không có dòng nào thay đổi (`git diff` xác nhận) — soát toàn bộ hunk của
      `git diff -U0`, không hunk nào rơi vào thân hàm `loadBranchStock`
- [x] `pnpm --filter @erp/api test -- pos-catalog-product.service.spec.ts` xanh — 47/47 pass
- [x] Source backend không chứa chuỗi tiếng Việt nào — sạch trên diff của feature này (DTO +
      service + spec). **Ngoại lệ đã có từ trước, không thuộc diff này**: 2 comment tiếng Việt
      trong `loadBranchStock` (dòng ~513, ~557 hiện tại) — nằm trong hàm bị khoá bởi ADR-01, không
      chạm. Nợ kỹ thuật cũ, không sửa ở feature này.
- [ ] `openapi.snapshot.json` + `schema.ts` đã regenerate và commit — đã regenerate (T-01-07/
      T-02-06), **chưa commit**
- [ ] Demo chạy trước người thật ở gate G4

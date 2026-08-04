---
id: UOW-02
slug: evaluate-cart
title: Client tính được khuyến mại cho một giỏ hàng và biết vì sao CTKM khác không chạy
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-01, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-12, AC-13, AC-14, AC-22, AC-25, AC-26, AC-29]
risk: high
status: in_progress
rollback: endpoint đọc thuần, không ghi bảng nào — gỡ route là hết tác dụng, không có dữ liệu cần dọn
---

# UOW-02 — Engine tính khuyến mại

Trái tim của epic. Nhận `PromotionProgram[]` + `CartContext`, trả `PromotionEvaluation` thuần
data. Không I/O, không async, không đọc `Date.now()` — thời điểm luôn từ `cart.at`.

## Demo script

1. Seed 1 org + 1 branch + cây nhóm 2 cấp + 4 item giá `685.000`, `100.000`, `200.000`,
   `300.000`.
2. Tạo CTKM `ITEM_DISCOUNT` 30% trên SKU `685.000`; `POST /v2/promotions/evaluate` với giỏ 1
   đơn vị → `discountAmount = 205.500`, `unitPriceAfter = 479.500` (AC-01).
3. Tạo thêm CTKM cùng SKU giảm 50% với `priority = 20`; evaluate lại → CTKM 30% thắng, CTKM
   50% nằm trong `skippedPrograms` với `reason = RESOURCE_TAKEN` và `takenBy` (AC-12).
4. Đổi CTKM sang `STOPPED`, sang thứ ngoài `daysOfWeek`, sang khung giờ lệch → mỗi lần đọc
   `skippedPrograms[].reason` thấy đúng `STOPPED` / `DAY_OF_WEEK` / `TIME_OF_DAY` (AC-03…05).
5. Ca qua đêm `22:00–02:00` với `at = 01:00` → **áp dụng**.
6. Chạy bậc thang, quà nhân bản, `CHEAPEST` theo AC-06/07/09; đối chiếu tay từng con số.
7. Gọi 10 lần liên tiếp, `SELECT count(*)` mọi bảng trước/sau → không đổi (AC-22).

## In scope

- 5 strategy + `evaluateCondition` dùng chung + `discount-math`.
- `PromotionResolver` ba pha và `CartState` ba nhóm tài nguyên.
- `EvaluateCartQuery` + handler + DTO + route `POST /v2/promotions/evaluate`.
- `TypeormCatalogReader` (đường dẫn nhóm cha trong RAM) và `TypeormCustomerReader`.

## Not in scope

- Ghi kết quả vào hóa đơn, trừ kho quà (A-20) — epic POS.
- Cache (A-21).

## Risks

| Risk | Mitigation |
|---|---|
| Target quà không nằm trong giỏ nên không được nạp vào `catalog` → quà biến mất im lặng | `findActive` chạy **trước**, gộp `targetItemIds` vào danh sách nạp; đã ghi ở A-26 (T-02-03) |
| Cây nhóm có chu trình làm `buildPath` treo | Bound độ sâu 50, khớp `category-import.service.ts` (T-02-04) |
| Engine đọc `Date.now()` làm test không tái lập | Test tính thuần: gọi `resolve()` hai lần cùng input, `toEqual` (T-02-02) |
| Phần lẻ làm tròn khiến `Σ lineDiscounts ≠ discountAmount` | Dồn phần lẻ vào dòng cuối; kiểm bằng bất biến AC-29 (T-02-02) |

## Definition of done

- [ ] AC-01, AC-03…AC-09, AC-12, AC-13, AC-14, AC-22, AC-25, AC-26, AC-29 pass
- [ ] Mọi `reason` là hằng thuộc union có kiểu, không phải chuỗi tự do
- [ ] Engine gọi hai lần cùng input cho kết quả `deepEqual`
- [ ] Tổng giảm của một dòng không bao giờ vượt `quantity × unitPrice − manualLineDiscount`
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4

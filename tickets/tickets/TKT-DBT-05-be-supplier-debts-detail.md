# TKT-DBT-05 Backend — Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Report definition cho `SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT`: sổ chi
tiết công nợ của **1 NCC cụ thể** (bắt buộc chọn), theo từng phiếu nhập kho
(`GoodsReceiptEntity`) + mặt hàng (`GoodsReceiptLineEntity`), có 2 chế độ cột
("Hàng hóa" / "Mẫu mã") và cột công nợ tăng/giảm là **số luỹ kế (cumulative)**,
KHÁC với TKT-DBT-03 (nơi cột tương ứng là delta/dòng) — đây là điểm dễ nhầm nhất
trong toàn epic, đã verify bằng số liệu thật trong
`docs/24-debt-reports-spec.md` mục 4.

## Deliverables

- `apps/api/src/modules/reporting/debt-report/reports/supplier-debts-detail-by-document-and-product.report.ts`.
- Nguồn: `SupplierDebtEntity` (1-1 `goodsReceiptId`) join `GoodsReceiptEntity` +
  `GoodsReceiptLineEntity` (item/location) — chỉ hoá đơn `paymentMethod=CREDIT`
  ("Ghi nợ nhà cung cấp") mới xuất hiện trong báo cáo này; kèm
  `SupplierDebtPaymentEntity` cho các dòng thanh toán.
- Filter `groupBy: 'item' | 'productTemplate'` (map với FE "Thống kê theo":
  "Hàng hóa" / "Mẫu mã") — **quyết định bộ cột trả về, không phải chỉ đổi cách
  nhóm** (xem AC bên dưới).
- `documentType` (Loại chứng từ): ghép nhãn `"Phiếu nhập hàng - Ghi nợ nhà cung cấp"`
  từ `documentType` cố định + `GoodsReceiptEntity.paymentMethod`.
- `description` (Diễn giải) = `GoodsReceiptEntity.reason` (đã xác nhận với chủ sản
  phẩm — KHÔNG dùng `description`, dù entity có cả 2 field).
- Cột `%CK`/`Tiền CK`/`Thuế suất`/`Tiền thuế`: **hard-code trả về 0** cho mọi dòng
  (quyết định chủ sản phẩm: không bổ sung schema đợt này). Vẫn phải có mặt trong
  column catalog (FE cần render đủ cột), chỉ là giá trị luôn 0.
- **Không** có cột "Serial/IMEI" (quyết định chủ sản phẩm: Không — bỏ hẳn khỏi
  scope, không đưa vào column catalog).
- **Không** có cột "Kho"/"Vị trí" (quyết định chủ sản phẩm: cố ý bỏ khỏi báo cáo,
  2 cột này chỉ hiện khi xem chi tiết phiếu nhập, không phải trong báo cáo này).
- Cột `cumulativeDebtIncrease`/`cumulativeDebtDecrease`/`closingBalance`: tính **luỹ
  kế từ đầu kỳ đến dòng hiện tại** (không phải delta/dòng):
  - `cumulativeDebtIncrease(dòng N)` = tổng "Tiền thanh toán" (`(3)-(5)+(7)`, tức
    `lineTotal` do hiện tại `%CK`/`Thuế` = 0 nên thực chất = `lineTotal`) của mọi
    dòng hàng **từ đầu kỳ đến và bao gồm dòng N** (thứ tự theo ngày/chứng từ).
  - `closingBalance(dòng N)` = `Nợ đầu kỳ + cumulativeDebtIncrease(N) −
    cumulativeDebtDecrease(N)` — **tính lại mỗi dòng, không cộng dồn từ dòng
    trước** (khác TKT-DBT-03 nơi công thức là đệ quy `dòng N-1 + delta`).
  - Verify bằng đúng ví dụ số trong doc: 14 dòng cùng 1 phiếu, mỗi dòng "Tiền
    thanh toán" = 2.800.000 → cumulative chạy 2.8M → 5.6M → ... → 39.2M; với "Nợ
    đầu kỳ" = 80.360.000, `closingBalance` dòng 1 = 83.160.000, dòng cuối =
    119.560.000.
- Dòng "Cộng" theo từng phiếu nhập (subtotal, giống TKT-DBT-03) — dòng "Cộng" lấy
  giá trị luỹ kế cuối cùng của group đó (không cộng dồn thêm 1 lần nữa).
- Dòng đầu bảng "Số dư công nợ đầu kỳ" — tính từ `SupplierDebtEntity`, luỹ kế mọi
  phát sinh trước `fromDate`.

## Acceptance Criteria

- [ ] `supplierId` là filter **bắt buộc** (400 nếu thiếu).
- [ ] Khi `groupBy = 'item'` ("Hàng hóa"): trả đủ 20 cột kể cả breakdown công thức
      (1)-(8) (Số lượng/Đơn giá/%CK/Tiền CK/Thuế suất/Tiền thuế/Tiền thanh toán).
- [ ] Khi `groupBy = 'productTemplate'` ("Mẫu mã"): **response KHÔNG chứa các field
      breakdown (1)-(8)** (chỉ có `lineTotal`/`paymentAmount` dạng tổng) — FE dựa
      vào presence/absence của các field này để quyết định cột nào hiển thị (xem
      TKT-DBT-09). Số dòng trả về **không đổi** giữa 2 chế độ (không gộp nhiều dòng
      SKU thành 1) — chỉ đổi field nào có mặt trong response.
  - [ ] **Cần xác nhận trong review**: khi `groupBy='productTemplate'`, giá trị
        `itemCode`/`itemName` trả về là mã/tên **mẫu mã gốc** (VD `"ABA3335"`, bỏ
        hậu tố biến thể `-D-38`) — lấy từ `ProductEntity` cha của item đó (xem
        `VariantGenerationService`), lặp lại trên mọi dòng cùng mẫu mã.
- [ ] Query filter theo `actor.organizationId`; `branchId` optional (mặc định gộp
      toàn chuỗi, giống TKT-DBT-04).
- [ ] Test tái tạo đúng ví dụ số liệu 14 dòng trong doc — đặc biệt verify công thức
      cumulative KHÔNG bị nhầm với công thức delta (test case này là gate quan
      trọng nhất của ticket).

## Definition of Done

- [ ] `supplier-debts-detail-by-document-and-product.report.spec.ts` cover: chế độ
      "Hàng hóa" đủ cột, chế độ "Mẫu mã" thiếu đúng field, công thức cumulative
      (không phải delta) verify bằng số liệu mẫu thật, dòng "Cộng" + dòng đầu kỳ.
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] PR review đặc biệt chú ý: không copy nhầm công thức delta từ TKT-DBT-03.

## Tech Approach

```ts
function computeCumulativeColumns(rows: LineRow[], openingBalance: number) {
  let runningIncrease = 0;
  let runningDecrease = 0;
  return rows.map((row) => {
    runningIncrease += row.paymentAmount; // NOT delta-only, running total
    // runningDecrease += payment-row amount when row is a payment line
    return {
      ...row,
      cumulativeDebtIncrease: runningIncrease,
      cumulativeDebtDecrease: runningDecrease,
      closingBalance: openingBalance + runningIncrease - runningDecrease, // recomputed, not incremental from previous closingBalance
    };
  });
}
```

## Testing Strategy

- Unit: fixture 14-dòng-1-phiếu đúng số liệu thật trong doc, assert từng dòng
  cumulative + closingBalance chính xác đến đơn vị đồng.

## Dependencies

- Depends on: TKT-DBT-01.
- Blocks: TKT-DBT-06.

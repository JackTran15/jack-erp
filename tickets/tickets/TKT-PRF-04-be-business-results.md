# TKT-PRF-04 Backend — Kết quả kinh doanh (2 kỳ so sánh)

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Report definition cho `business-results`. Khác hẳn 2 báo cáo còn lại: **không phải bảng
"1 dòng/1 entity"** mà là báo cáo tài chính dạng cố định — ~20 dòng "Khoản mục" cố định
theo thứ tự phân cấp (I/II/2.1/2.1.1/a/b/...), mỗi dòng có công thức tham chiếu dòng khác
bằng số thứ tự, tính **2 lần độc lập** cho 2 kỳ song song (kỳ trước/kỳ hiện tại) rồi so
sánh. Cột vẫn khớp contract `ReportColumnHeader[]`/`ReportRow[]` hiện có (5 cột cố định,
cấu hình được qua "Sửa mẫu" giống mọi báo cáo khác) — chỉ khác ở chỗ **rows là danh mục cố
định do BE tính, không phải rows từ DB theo entity**. Đã có 4 screenshot UI mẫu thật.

## Deliverables

- `apps/api/src/modules/reporting/profit-report/business-results.calculator.ts` — hàm nội
bộ tính toàn bộ danh mục dòng cho **1 khoảng ngày** (gọi 2 lần: 1 lần cho `previousPeriod`,
1 lần cho `currentPeriod`), input: `{ organizationId, branchId?, fromDate, toDate }`, output:
`Record<lineItemKey, number>`.
- `apps/api/src/modules/reporting/profit-report/reports/business-results.report.ts` —
`ReportDefinition` implement, ghép 2 kỳ + tính `thayDoiPercent`/`thayDoiSoTien`, đăng ký
vào `ProfitReportRegistry` với key `business-results`.

**Filters** (khác hẳn 2 báo cáo kia — 2 kỳ song song):

- `Cửa hàng` — chỉ hiện ở chế độ Chuỗi cửa hàng, mặc định "Chuỗi cửa hàng" (org-wide), có
thể thu hẹp về 1 cửa hàng.
- `previousPeriod: { from, to }` — optional (không bắt buộc theo screenshot).
- `currentPeriod: { from, to }` — bắt buộc.

**Columns** (5 cột cố định, đúng dialog "Sửa mẫu"):


| key              | label              | loại                                                |
| ---------------- | ------------------ | --------------------------------------------------- |
| `khoanMuc`       | Khoản mục          | text, pin left                                      |
| `kyTruoc`        | Kỳ trước           | currency                                            |
| `kyHienTai`      | Kỳ hiện tại        | currency                                            |
| `thayDoiPercent` | Thay đổi (%)       | `(kyHienTai/kyTruoc*100)-100`, null nếu `kyTruoc=0` |
| `thayDoiSoTien`  | Thay đổi (Số tiền) | `kyHienTai - kyTruoc`                               |


**Danh mục dòng cố định + công thức + nguồn dữ liệu**:


| #       | Khoản mục                         | Công thức                 | Nguồn dữ liệu                                                                                                                                |
| ------- | --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| I       | Doanh số bán hàng                 | `2.1.1a + 2.1.2 − 2.1.3a` | tính lại                                                                                                                                     |
| II      | Doanh thu                         | `2.1 + 2.2`               | tính lại                                                                                                                                     |
| 2.1     | Thu từ bán hàng                   | `2.1.1 + 2.1.2 − 2.1.3`   | tính lại                                                                                                                                     |
| 2.1.1   | Tiền hàng                         | `2.1.1a − 2.1.1b`         | tính lại                                                                                                                                     |
| 2.1.1.a | Tiền hàng bán ra                  | —                         | Σ `invoice_items.lineTotal` với `direction=OUT`                                                                                              |
| 2.1.1.b | Tiền hàng trả lại                 | —                         | Σ `invoice_items.lineTotal` với `direction=IN`                                                                                               |
| 2.1.2   | Tiền phí                          | —                         | không có nguồn dữ liệu → **hard-code 0**, TODO khi có field phí trên `InvoiceEntity`                                                         |
| 2.1.3   | Khuyến mại                        | `2.1.3a − 2.1.3b`         | tính lại                                                                                                                                     |
| 2.1.3.a | Khuyến mại hàng bán ra            | —                         | Σ (`invoice.discountAmount + pointsDiscountAmount`) của invoice `type=SALE`. ❓ **Cần xác nhận (xem AC)**: hoá đơn `EXCHANGE` gộp vào đây     |
| 2.1.3.b | Khuyến mại hàng trả lại           | —                         | tương tự, `type=RETURN`                                                                                                                      |
| 2.2     | Thu khác                          | —                         | không có nguồn dữ liệu → **hard-code 0**                                                                                                     |
| III     | Chi phí                           | `3.1 + 3.2`               | tính lại                                                                                                                                     |
| 3.1     | Chi phí giá vốn hàng hóa          | `3.1.1 + 3.1.2`           | tính lại                                                                                                                                     |
| 3.1.1   | Xuất kho bán hàng                 | —                         | Σ (`costPrice × quantity`) với `direction=OUT`                                                                                               |
| 3.1.2   | Nhập kho hàng trả lại             | —                         | **−**Σ (`costPrice × quantity`) với `direction=IN` (âm)                                                                                      |
| 3.2     | Chi phí khác                      | `3.2.1 + 3.2.2`           | tính lại                                                                                                                                     |
| 3.2.1   | Phí giao hàng trả đối tác         | —                         | không có entity đối tác giao hàng → **hard-code 0**                                                                                          |
| 3.2.2   | Chi khác                          | —                         | Σ `CashPaymentLineEntity.amount` của `CashPaymentEntity` có `status=POSTED`, `postedAt` trong kỳ, org (+branch nếu chọn cửa hàng cụ thể) scope, VÀ dòng có `categoryId IS NULL` **hoặc** `categoryId` = id của category `code='CHI_KHAC'` (`CashVoucherCategoryEntity`, seed mặc định qua `CashVoucherCategorySeederService` — xem `DEFAULT_CASH_VOUCHER_CATEGORIES`). Đã xác nhận với product owner: KHÔNG dùng `ExpenseEntity`. |
| 3.3     | Tỷ trọng CP giá vốn/Doanh thu (%) | `(3.1/II)*100`            | tính lại, null nếu II=0                                                                                                                      |
| 3.4     | Tỷ trọng CP khác/Doanh thu (%)    | `(3.2/II)*100`            | tính lại, null nếu II=0                                                                                                                      |
| IV      | Lợi nhuận                         | `II − III`                | tính lại                                                                                                                                     |


Không phân trang (danh mục cố định, ~20 dòng), `totals: null` (dòng IV đã là dòng tổng),
`total: rows.length`.

## Acceptance Criteria — kèm câu hỏi cần xác nhận

- [x] ❓ **Xác nhận cách xử lý hoá đơn EXCHANGE ở dòng 2.1.3 (Khuyến mại)**: `discountAmount`/
  ```
  `pointsDiscountAmount` chỉ có ở header hoá đơn, không tách được theo dòng OUT/IN như
  `2.1.1a`/`2.1.1b`. Đề xuất mặc định: gán toàn bộ discount header của hoá đơn EXCHANGE
  vào `2.1.3a` (coi là "bán mới"). **Người trả lời ticket này xác nhận hoặc chỉnh lại
  cách xử lý trước khi code.**
  ```
  + Làm theo đề xuất
- [x] ❓ **Xác nhận dòng 3.2.2 "Chi khác"**: lấy từ phiếu chi (`CashPaymentEntity` +
  `CashPaymentLineEntity`), KHÔNG phải `ExpenseEntity`.
  ```
  + Lấy tương ứng ở mục chi, của phiếu chi, mục đích chi khác
  + Nếu phiếu chi khác, không chọn mục chi, thì thuộc mục Chi khác
  DEFAULT_CASH_VOUCHER_CATEGORIES, direction.OUT
  ```
  Đã tra cứu module `accounting/cash-vouchers/`: `CashPaymentEntity` (header:
  `status: CashVoucherStatus` DRAFT/POSTED/REVERSED, `postedAt`, `organizationId`,
  `branchId`) có nhiều `CashPaymentLineEntity` (mỗi dòng có `categoryId?: uuid` nullable,
  `amount`). `CashVoucherCategoryEntity` (`code`, `name`, `direction: IN|OUT`) seed sẵn
  `CHI_KHAC` → "Chi khác" qua `CashVoucherCategorySeederService`
  (`DEFAULT_CASH_VOUCHER_CATEGORIES`). Công thức cuối: Σ `CashPaymentLineEntity.amount`
  của mọi `CashPaymentEntity` có `status=POSTED`, `postedAt` trong kỳ, org(+branch) scope,
  VÀ dòng có `categoryId IS NULL` HOẶC `categoryId` = id của category `code='CHI_KHAC'`.
  `REVERSED` vouchers loại khỏi tổng (không phải giao dịch thật đang có hiệu lực).
- [x] `2.1.1a`/`2.1.1b`/`3.1.1`/`3.1.2` tách đúng theo `invoice_items.direction` (OUT/IN),
  ```
  KHÔNG theo `invoice.type` — xử lý đúng cả hoá đơn EXCHANGE (có cả dòng OUT và IN
  trong cùng 1 hoá đơn).
  ```
- [x] `3.1.2` (Nhập kho hàng trả lại) và bất kỳ dòng "trả lại"/"giảm" nào khác đều lưu giá
  ```
  trị **âm** — verify khớp mock: dòng 3.1.2 = −528.000 khi kỳ hiện tại, không phải
  528.000.
  ```
- [x] "Cửa hàng" mặc định = Chuỗi cửa hàng (không filter branch) ở chế độ Chuỗi — verify
  ```
  với `CONSOLIDATED_PERMISSION`, giống 2 báo cáo còn lại trong epic.
  ```
- [x] `thayDoiPercent`/`thayDoiSoTien` tính đúng công thức, `thayDoiPercent = null` khi
  ```
  `kyTruoc = 0` (không chia cho 0).
  ```
  + Kỳ trước = 0 thì thayDoiPercent = 100, thay đổi số tiền = kỳ hiện tại - kỳ trước
- [x] `IV. Lợi nhuận` = `II − III` đúng cho cả 2 kỳ độc lập — verify bằng phép tính tay trên
  ```
  1 bộ dữ liệu test.
  ```

## Definition of Done

- [ ] `business-results.report.spec.ts`: unit test toàn bộ cây công thức trên 1 bộ dữ liệu
  ```
  cố định (đối chiếu tay từng dòng I → IV); 1 test case hoá đơn EXCHANGE; 1 test case
  kỳ trước = 0 (thayDoiPercent null); 1 test case xác nhận `3.1.2` âm.
  ```
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Không tiếng Việt trong code/log/comment backend (nhãn "Khoản mục" tiếng Việt định
  ```
  nghĩa ở FE registry hoặc 1 bảng mapping key→label riêng, không hard-code chuỗi tiếng
  Việt rải rác trong logic tính toán).
  ```

## Tech Approach

```ts
interface BusinessResultsLineValues {
  goodsSoldOut: number;      // 2.1.1.a
  goodsReturnedIn: number;   // 2.1.1.b
  fee: number;                // 2.1.2 — hard-coded 0
  promoOnSaleOut: number;     // 2.1.3.a
  promoOnReturnIn: number;    // 2.1.3.b
  otherIncome: number;        // 2.2 — hard-coded 0
  cogsOut: number;            // 3.1.1
  cogsReturnedIn: number;     // 3.1.2 (negative)
  deliveryFeeToPartner: number; // 3.2.1 — hard-coded 0
  otherExpense: number;       // 3.2.2 — Σ CashPaymentLineEntity.amount, CHI_KHAC or uncategorized, POSTED only
}

function computePeriod(raw: BusinessResultsLineValues) {
  const goodsRevenue = raw.goodsSoldOut - raw.goodsReturnedIn; // 2.1.1
  const promo = raw.promoOnSaleOut - raw.promoOnReturnIn; // 2.1.3
  const salesRevenue = goodsRevenue + raw.fee - promo; // 2.1
  const totalRevenue = salesRevenue + raw.otherIncome; // II
  const salesVolume = raw.promoOnSaleOut !== undefined
    ? raw.goodsSoldOut + raw.fee - raw.promoOnSaleOut // I = 2.1.1a + 2.1.2 - 2.1.3a
    : raw.goodsSoldOut;
  const cogs = raw.cogsOut + raw.cogsReturnedIn; // 3.1 (cogsReturnedIn already negative)
  const otherExpense = raw.deliveryFeeToPartner + raw.otherExpense; // 3.2
  const totalExpense = cogs + otherExpense; // III
  const profit = totalRevenue - totalExpense; // IV
  // ... build the full ~20-row array with all intermediate lines, in fixed order
}
```

## Testing Strategy

- Unit: `business-results.report.spec.ts` (dựng 1 bộ invoice/invoice_items/expenses giả lập
đủ để tính tay từng dòng, assert BE ra đúng số).
- Không cần E2E riêng — gộp vào TKT-PRF-11.

## Dependencies

- Depends on: TKT-PRF-01.
- Blocks: TKT-PRF-05.


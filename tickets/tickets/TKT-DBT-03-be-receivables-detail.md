# TKT-DBT-03 Backend — Chi tiết công nợ phải thu theo mặt hàng

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Report definition cho `RECEIVABLES_DETAIL_BY_PRODUCT`: sổ chi tiết công nợ của
**1 khách hàng cụ thể** (bắt buộc chọn), mỗi dòng là 1 chứng từ (hoá đơn tín dụng
hoặc phiếu thu nợ), group theo chứng từ + dòng "Cộng" subtotal, số dư luỹ kế chạy
theo từng dòng. Đây là ticket phức tạp nhất về business logic trong epic — bám sát
chi tiết đã verify bằng số liệu thật trong `docs/24-debt-reports-spec.md` mục 2.

## Deliverables

- `apps/api/src/modules/reporting/debt-report/reports/receivables-detail-by-product.report.ts`.
- Query nguồn: `InvoiceDebtEntity` (dòng `CREDIT_INVOICE`) join `InvoiceItemEntity`
  (line items) UNION `DebtPaymentEntity`→`CashReceiptEntity` (dòng `PAYMENT_RECEIPT`),
  order theo ngày, group theo `documentNumber`.
- Cấu trúc response mỗi dòng (row-level, không phải column-level) cần phân biệt 3
  loại: `HEADER` (dòng đầu group — có Ngày/Số chứng từ/Loại chứng từ/Diễn giải/Chi
  nhánh), `ITEM` (dòng hàng hoá con), `SUBTOTAL` (dòng "Cộng" cuối group). FE hiện
  tại (`ReportPage`) render bảng phẳng theo rows trả về — service phải tự tính sẵn
  cấu trúc group/subtotal ở BE, KHÔNG để FE tự group.
- Cột `documentType` (Loại chứng từ) — nhãn ghép: hoá đơn → `"Hóa đơn bán hàng"`,
  phiếu thu → ghép `CashReceiptEntity.purpose` + `DebtPaymentEntity.paymentMethod`
  (VD `"Phiếu thu nợ - Tiền mặt"`). **Cần xác nhận trong review**: dòng
  `PT000001` trong ảnh mẫu dùng nhãn `"Phiếu thu tiền mặt"` (không có "nợ") nhưng
  vẫn giảm nợ — nghĩa là mọi `DebtPaymentEntity` gắn với hoá đơn của khách hàng này
  đều hiện trong báo cáo, bất kể `CashReceiptEntity.purpose` cụ thể là gì; nhãn chỉ
  là hiển thị, không phải điều kiện lọc.
- Cột `description` (Diễn giải):
  - Dòng hoá đơn: template cố định `"Ghi công nợ khách hàng cho hóa đơn số {documentNumber}"`,
    build ở BE tại thời điểm query (không lưu field mới).
  - Dòng phiếu thu: = `CashReceiptEntity.reason` (field thật, không build).
- Cột `debtIncrease`/`collectedAmount` (Nợ tăng/Đã thu) trên dòng hoá đơn: theo
  từng `InvoiceItemEntity` line, `Đã thu + Nợ tăng = lineTotal` — tỉ lệ phân bổ lấy
  từ dữ liệu thanh toán thực tế tại thời điểm tạo hoá đơn (không phải chia đều theo
  tỉ lệ tổng hoá đơn) — **xác nhận nguồn tỉ lệ phân bổ per-line trong review**, vì
  `InvoiceDebtEntity` chỉ lưu tổng `originalAmount` ở mức hoá đơn, không có field
  phân bổ theo từng dòng hàng sẵn có (cần join thêm bảng payment-line nếu có, hoặc
  suy ra từ % của `remainingAmount`/`originalAmount` áp cho từng dòng — quyết định
  approach cụ thể khi code, ghi rõ trong PR).
- Cột `debtDecrease` (Nợ giảm) trên dòng phiếu thu = `DebtPaymentEntity.amount`;
  theo quyết định chủ sản phẩm: **mỗi phiếu thu chỉ sinh đúng 1 dòng trong báo cáo**
  (không tách theo từng hoá đơn được phân bổ) — nếu hoá đơn liên quan không cập
  nhật "Đã thu" thì `Đã thu = 0` và phiếu thu đó là dòng "Nợ giảm".
- Cột `runningBalance` (Số dư cuối kỳ): luỹ kế `dòng N = dòng N-1 + Nợ tăng(N) −
  Nợ giảm(N)`, khởi tạo từ dòng "Số dư công nợ đầu kỳ" = tổng luỹ kế
  `InvoiceDebtEntity.originalAmount - DebtPaymentEntity.amount` của khách hàng đó
  **trước** `fromDate`.
- **Không** thêm cột "Nhân viên thu" (quyết định chủ sản phẩm: Không).
- Dòng tổng cuối toàn báo cáo (khác dòng "Cộng" từng chứng từ): cộng dồn Số
  lượng/Tiền hàng/Khuyến mại/Tổng/Đã thu/Nợ tăng/Nợ giảm trên toàn kỳ; "Số dư cuối
  kỳ" ở dòng này = số dư luỹ kế cuối cùng (không cộng dồn thêm).

## Acceptance Criteria

- [ ] `customerId` là filter **bắt buộc** (400 nếu thiếu).
- [ ] Query filter theo `actor.organizationId` + `customerId`; KHÔNG filter theo
      `branchId` (gộp mọi chi nhánh khách hàng từng giao dịch — xem Scope epic).
      Cột `branchName` trả về đúng chi nhánh phát sinh của từng chứng từ.
- [ ] Verify bằng test case tái tạo đúng số liệu mẫu trong doc: hoá đơn 13 dòng
      hàng (6 dòng trả đủ, 1 dòng trả 1 phần 465k/375k, 6 dòng chưa trả), dòng
      "Cộng" đúng tổng, dòng phiếu thu giảm đúng số dư luỹ kế.
- [ ] Dòng "Cộng" xuất hiện cho MỌI group chứng từ kể cả khi chỉ có 1 dòng hàng.

## Definition of Done

- [ ] `receivables-detail-by-product.report.spec.ts` cover: multi-line invoice
      full-paid, multi-line invoice partial-paid (mixed), single-line invoice,
      payment-receipt-only row, cumulative running balance qua nhiều chứng từ,
      dòng tổng cuối báo cáo.
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] PR mô tả rõ approach đã chọn cho việc phân bổ Đã thu/Nợ tăng theo từng dòng
      hàng (do đây là điểm chưa có đặc tả 100% rõ ràng từ nguồn dữ liệu thô).

## Tech Approach

Tham khảo cấu trúc UNION 2 nguồn dùng cho `vw_stock_documents` (goods-receipt ∪
goods-issue ∪ stock-transfer) trong `docs/22-inventory-reports-views.md` mục 3.2
làm mẫu cách gộp 2 loại chứng từ khác entity vào 1 danh sách dòng thống nhất, áp
dụng tương tự cho `InvoiceDebtEntity` ∪ `DebtPaymentEntity`+`CashReceiptEntity`.

## Testing Strategy

- Unit: mock repository trả về fixture đúng như số liệu mẫu trong doc, assert
  từng cột + running balance khớp chính xác đến đơn vị đồng.

## Dependencies

- Depends on: TKT-DBT-01.
- Blocks: TKT-DBT-06.

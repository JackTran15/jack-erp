# TKT-DBT-02 Backend — Công nợ khách hàng

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Report definition cho `CUSTOMER_DEBTS`: sổ công nợ khách hàng theo kỳ, GỘP số liệu
từ 2 nguồn — nợ POS (`InvoiceDebtEntity`/`DebtPaymentEntity`) VÀ sổ kế toán
(`ReceivableEntity`/`ReceivableSettlementEntity`) — theo quyết định của chủ sản
phẩm trong `docs/24-debt-reports-spec.md` mục 1 ("Cả hai"). Luôn gộp toàn bộ chi
nhánh, tính real-time (không cache).

## Deliverables

- `apps/api/src/modules/reporting/debt-report/reports/customer-debts.report.ts` —
  `ReportDefinition` implement:
  - Gọi `DebtPeriodService.getPeriodLedger()` **2 lần** (1 lần với nguồn
    `invoice_debts`/`debt_payments`, 1 lần với nguồn kế toán
    `receivables`/`receivable_settlements`) rồi **cộng dồn theo `customerId`** ở
    tầng service (JS, không GROUP BY chéo 2 bảng trong SQL).
  - Join `CustomerEntity` (code, name, groupId→tên nhóm, phone, email, address) +
    `MembershipCardEntity` (cardNumber, tier) — left join, không bắt buộc có thẻ.
  - `summaryLabel: "Tổng"` — footer cộng dồn 4 cột tiền (đầu kỳ/tăng/giảm/cuối kỳ).
- Đăng ký report này vào `DebtReportRegistry` (từ TKT-DBT-01) với key
  `customer-debts` (backendKey khớp FE `getReportBackendKey`).
- Filter accepted: `reportPeriod` (preset) hoặc `fromDate`/`toDate`, KHÔNG có
  `branchId` (luôn org-wide, xem Scope epic).
- Column catalog (theo đúng thứ tự đã chốt trong doc, mục 1):
  `customerCode`(pin), `customerName`(pin, link), `customerGroup`, `customerPhone`,
  `customerEmail`, `openingDebt`, `increaseDebt`, `decreaseDebt`, `closingDebt`,
  `address`, `membershipCardNumber`, `membershipTier`.
  **Không** có cột Tỉnh thành/Quận huyện/Phường xã (quyết định chủ sản phẩm: bỏ
  qua, giữ nguyên field `address` gộp — giống import/export khách hàng).

## Acceptance Criteria

- [ ] Query filter theo `actor.organizationId`; KHÔNG filter theo `branchId` dù
      actor có `branchId` trong context (test bằng cách gọi từ 2 branch khác nhau
      của cùng 1 org → kết quả giống hệt nhau).
- [ ] Với 1 khách hàng có cả `InvoiceDebtEntity` (nợ POS) và `ReceivableEntity`
      (sổ kế toán) trong cùng kỳ, "Tăng trong kỳ" = tổng `originalAmount` của cả 2
      nguồn (không double-count nếu 1 giao dịch xuất hiện ở cả 2 — xem rủi ro).
- [ ] "Nợ cuối kỳ" đúng công thức
      `Nợ đầu kỳ + Tăng trong kỳ - Giảm trong kỳ`, tính ở BE (không phải FE).
- [ ] Khách hàng không có `MembershipCardEntity` vẫn trả về hàng, 2 cột thẻ = null.
- [ ] Response envelope `{ rows, totals, total }` — `totals` tính trên **toàn bộ
      rows sau filter** (không chỉ trang hiện tại), giống contract inventory-reports.

## Definition of Done

- [ ] `customer-debts.report.spec.ts`: unit test số liệu 1 khách hàng có cả POS
      debt và receivable trong cùng kỳ; unit test khách hàng chỉ có 1 trong 2
      nguồn; unit test kỳ liên tiếp (đầu kỳ kỳ sau = cuối kỳ kỳ trước).
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Không tiếng Việt trong code/log/comment (label cột tiếng Việt chỉ định nghĩa
      ở FE registry, không hard-code ở BE).

## Tech Approach

```ts
export const customerDebtsReport: ReportDefinition<CustomerDebtsFilterDto> = {
  key: 'customer-debts',
  async search(dto, actor) {
    const [posLedger, arLedger] = await Promise.all([
      debtPeriodService.getPeriodLedger(
        { increaseTable: 'invoice_debts', decreaseTable: 'debt_payments', partyIdColumn: 'customer_id' },
        { organizationId: actor.organizationId, fromDate: dto.fromDate, toDate: dto.toDate },
      ),
      debtPeriodService.getPeriodLedger(
        { increaseTable: 'receivables', decreaseTable: 'receivable_settlements', partyIdColumn: 'customer_id' },
        { organizationId: actor.organizationId, fromDate: dto.fromDate, toDate: dto.toDate },
      ),
    ]);
    const merged = mergeLedgersByPartyId(posLedger, arLedger); // sum opening/increase/decrease per customerId
    return this.attachCustomerAndMembership(merged);
  },
};
```

**Rủi ro cần xử lý trong code review**: nếu 1 hoá đơn tín dụng POS sau này được
"post" thêm vào sổ kế toán (tạo cả `InvoiceDebtEntity` lẫn `ReceivableEntity` cho
cùng giao dịch), gộp đơn giản sẽ double-count. Từ khảo sát entity hiện tại, 2 luồng
này độc lập (không thấy field liên kết chéo `InvoiceDebtEntity.receivableId` hay
ngược lại) — merge cộng dồn trực tiếp là đúng cho state hiện tại của schema; ghi
chú TODO nếu sau này 2 luồng được liên kết.

## Testing Strategy

- Unit: `customer-debts.report.spec.ts` (mock `DebtPeriodService`, verify merge +
  entity join logic).
- Không cần E2E riêng ở ticket này — gộp vào TKT-DBT-11.

## Dependencies

- Depends on: TKT-DBT-01.
- Blocks: TKT-DBT-06.

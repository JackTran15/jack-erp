---
id: UOW-05
slug: cash-ledger-export
title: Xuất khẩu Sổ chi tiết tiền mặt ra Excel
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-04, UOW-06]
requirements: [US-05]
verifies: [AC-16, AC-17, AC-21]
risk: low
status: todo
rollback: Trả nút Xuất khẩu ở LedgerCashPage về stub toast
---

# UOW-05 — Xuất khẩu Sổ chi tiết tiền mặt ra Excel

## Demo script

1. Mở Quỹ → Sổ chi tiết tiền mặt, chọn khoảng ngày có phát sinh
2. Bấm "Xuất khẩu" → file .xlsx tải về
3. Mở file: dòng đầu là "Số dư đầu kỳ" đúng bằng số trên màn hình
4. Các dòng giao dịch đúng thứ tự, cột "Số tiền còn lại" luỹ kế khớp từng dòng
5. Dòng cuối là tổng số tiền thu và tổng số tiền chi trong kỳ

## In scope

- Service dựng payload sổ quỹ + xuất workbook qua builder dùng chung
- Route export + nối nút FE

## Not in scope

- Sổ chi tiết tiền gửi — đã có `GET /deposit-ledger/export`
- In sổ quỹ (MISA cũng không có)

## Risks

| Risk | Mitigation |
|---|---|
| ~~Sổ quỹ không nằm trong registry báo cáo v2 nên không dùng được `ReportExportService` (A-08)~~ | **Hết rủi ro sau ADR-06**: sổ quỹ cấp `ExportFetcher` của nó và đi trọn `ExportPipeline`; chỉ phần lấy dòng là riêng |

## Definition of done

- [ ] Cả AC-16..17 và AC-21 pass
- [ ] Workbook đi qua `ExportPipeline` + `XlsxStreamWriter`, không dựng ExcelJS trực tiếp
- [ ] Demo script chạy được trước người thật ở gate G4

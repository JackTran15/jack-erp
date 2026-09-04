---
id: UOW-01
slug: ledger-card-description
title: Chi tiết tồn kho hiển thị đúng Diễn giải từ chứng từ gốc
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: revert 2 file diffs (stock-ledger-reference.constants.ts, stock-summary-detail.service.ts) — không có migration, không đổi schema
---

# UOW-01 — Chi tiết tồn kho hiển thị đúng Diễn giải từ chứng từ gốc

## Demo script

1. Mở phiếu nhập kho NK000240 trong backoffice, xác nhận Diễn giải = "Nhập kho Biên Hòa 2".
2. Mở Chi tiết tồn kho của mặt hàng `TRUC078-B4-N-37` tại `Kho BH` (đúng kịch bản trong ảnh báo lỗi) → dòng NK000240 hiển thị Diễn giải = "Nhập kho Biên Hòa 2", không phải "Phiếu nhập kho NK000240".
3. Tìm một phiếu xuất kho, phiếu chuyển kho, hoặc đơn mua hàng có Diễn giải khác rỗng → mở thẻ kho liên quan, xác nhận cột Diễn giải khớp đúng.
4. Gõ một đoạn Diễn giải thật vào ô lọc Diễn giải của Chi tiết tồn kho → dòng tương ứng vẫn xuất hiện trong kết quả lọc.
5. Tìm một dòng có reference_type = INVOICE (hoá đơn bán hàng) hoặc một chứng từ có Diễn giải để trống → xác nhận ô Diễn giải trống, không hiện chuỗi cũ.

## In scope

- `descriptionSql()` + `REFERENCE_DESCRIPTION_TABLES` trong `stock-ledger-reference.constants.ts`, phủ toàn bộ 13 `reference_type` có trong `REFERENCE_DOCUMENT_TABLES`.
- Cột hiển thị `description` trong `StockSummaryDetailService.getLedgerCard`.
- Bộ lọc `dto.description` trong cùng service — đổi để lọc trên cùng nguồn dữ liệu với cột hiển thị.

## Not in scope

- `stock_ledger_entries.notes` tại nơi ghi sổ (goods-receipt/goods-issue/adjustment service) — giữ nguyên.
- `csv-export.service.ts` (export CSV kỹ thuật của ledger).
- Các trang danh sách chứng từ khác (PurchaseOrdersPage, StockTransferPage, StockTakesPage) — đã tự đọc đúng field, không qua đường này.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Cột nguồn cho ADJUSTMENT (`reason_description` vs `notes`) chưa có tiền lệ UI để đối chiếu (A-04, non-blocking) | Chọn `reason_description` theo comment entity "Human-readable explanation"; dễ đổi 1 dòng trong map nếu sai, không ảnh hưởng 12 loại còn lại |
| Thêm subquery vào WHERE clause khi có filter Diễn giải có thể chậm hơn filter cũ trên cột đã có sẵn trong CTE | Đã có tiền lệ y hệt với `document_number` filter (`filtersDocumentNumber`) trên cùng bảng, cùng quy mô dữ liệu (1 item + 1 storage) — không phải rủi ro mới |

## Definition of done

- [x] AC-01..04 pass — xác nhận ở tầng dữ liệu + API: chạy trực tiếp `descriptionSql()`
  qua `AppDataSource.query()` trên `erp_dev` thật (GOODS_RECEIPT/GOODS_ISSUE/INVOICE đều
  đúng) + 6 unit test xanh (`stock-summary-detail.service.spec.ts`). CHƯA xác nhận trên
  UI thật (mở dialog "Chi tiết tồn kho" trong backoffice) — cần đăng nhập, việc tôi không
  được phép tự làm. Tick theo yêu cầu trực tiếp của Akenzy ("cứ pass G4 luôn — tin vào
  code+test đã làm", 2026-09-04) — KHÔNG phải một tuyên bố rằng demo UI thật đã chạy.
- [x] `pnpm --filter @erp/api test` không đỏ thêm test nào — 2 test đỏ trong
  `auth.service.spec.ts` đã đỏ sẵn trên `main` (xác nhận bằng `git stash`), không liên quan
- [x] Demoed và accepted tại gate G4 — KHÔNG có demo UI thật; Akenzy chủ động yêu cầu
  pass G4 dựa trên code review + build/test xanh, không chờ demo thủ công (xem ghi chú
  ở dòng AC-01..04 phía trên)

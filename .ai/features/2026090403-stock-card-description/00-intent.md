---
feature: stock-card-description
slug: 2026090403-stock-card-description
owner: Akenzy
created: 2026-09-04
status: draft
---

# Intent — Diễn giải đúng trong Chi tiết tồn kho

## Problem

Dialog "Chi tiết tồn kho" (thẻ kho một mặt hàng tại một kho) hiển thị cột
**Diễn giải** bằng một chuỗi máy sinh ("Phiếu nhập kho NK000240",
"Xuất hàng: XK000456") thay vì diễn giải thật do người dùng nhập trên chứng từ
gốc (ví dụ phiếu NK000240 thực ra có Diễn giải = "Nhập kho Biên Hòa 2"). Cột này
vì vậy không mang thông tin gì hơn cột "Số chứng từ" đứng ngay bên cạnh nó.

Gốc rễ: `stock_ledger_entries.notes` được ghi cứng bằng chuỗi máy sinh tại thời
điểm ghi sổ (`goods-receipt.service.ts:821`, `goods-issue.service.ts:330`,
tương tự cho `adjustment.service.ts:250`), và API thẻ kho
(`GET /v2/inventory/stock/summary/ledger-card` →
`StockSummaryDetailService.getLedgerCard`) đọc thẳng cột đó cho Diễn giải
(`stock-summary-detail.service.ts:516`) thay vì tra ngược về chứng từ gốc.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| ------- | ------------------ | ------------------ |
| Nhân viên kho / kế toán xem báo cáo tồn kho | Mở Chi tiết tồn kho, cột Diễn giải chỉ lặp lại loại + số chứng từ | Cột Diễn giải hiển thị đúng nội dung người dùng đã ghi trên chứng từ gốc |

## Success signal

Với thẻ kho của một mặt hàng có ít nhất một phiếu nhập/xuất mang Diễn giải khác
rỗng, dòng tương ứng trong dialog Chi tiết tồn kho hiển thị đúng chuỗi đó (không
phải "Phiếu nhập kho ..." / "Xuất hàng: ..."), kiểm chứng bằng ai-dlc-verify hoặc
so sánh trực tiếp với form sửa chứng từ gốc.

## Out of scope

- Đổi giá trị lưu trong `stock_ledger_entries.notes` — cột này vẫn giữ chuỗi máy
  sinh cho các nơi khác đang đọc nó (`csv-export.service.ts:318`, export CSV kỹ
  thuật của ledger) — chỉ đổi những gì API thẻ kho *trả về* cho `description`.
- Sửa export CSV thô của ledger (`csv-export.service.ts`) — đó là export
  kỹ thuật theo tên cột tiếng Anh (`itemId`, `notes`...), không phải màn hình
  "Chi tiết tồn kho" bị báo lỗi, và không có nhãn "Diễn giải" nào ở đó.
- Sửa cột "Diễn giải" ở các trang danh sách chứng từ khác
  (`PurchaseOrdersPage`, `StockTransferPage`, `StockTakesPage` đã tự đọc đúng
  field của mình, không qua `stock_ledger_entries.notes`).
- Backfill dữ liệu lịch sử — vì fix chỉ thay đổi cách API *tra cứu* tại thời điểm
  đọc (join theo `reference_id`), không cần backfill: chứng từ gốc cũ vẫn còn
  Diễn giải gốc của nó.

## Constraints

| Kind    | Detail |
| ------- | ------ |
| Perf    | Thẻ kho luôn lọc theo 1 `item_id` + 1 `storage_id`, khối lượng dòng nhỏ (thường vài chục đến vài trăm dòng/kỳ) — subquery tương quan theo `reference_id` (giống `documentNumberSql`) không phải lo hiệu năng ở quy mô này. |
| Reuse   | Phải tái dùng đúng pattern `CASE reference_type WHEN ... THEN (SELECT ...)` đã có ở `documentNumberSql()` (`stock-ledger-reference.constants.ts`) — không join 7+ bảng. |

## Existing surface touched

- Reused: `documentNumberSql()` pattern (`stock-ledger-reference.constants.ts`), `StockSummaryDetailService.getLedgerCard` (`stock-summary-detail.service.ts`).
- Adjacent features: bộ lọc `dto.description` trên cùng endpoint (`stock-summary-detail.service.ts:380`) — hiện lọc trên `m.notes` (chuỗi máy sinh), phải đổi theo cùng nguồn dữ liệu với cột hiển thị để không lệch nhau giữa lọc và hiển thị.
- Entry points: `POST /v2/inventory/stock/summary/ledger-card` (không đổi request/response shape, chỉ đổi giá trị field `description`).

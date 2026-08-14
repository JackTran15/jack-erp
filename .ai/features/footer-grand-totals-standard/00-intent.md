---
feature: footer-grand-totals-standard
slug: footer-grand-totals-standard
owner: Loc Tran
created: 2026-08-14
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Chuẩn hoá `totals` + ba bảng POS

Tiếp nối `footer-grand-totals` (đã đóng G4: 12 bảng Kho hàng + Báo cáo kho, 24 ticket, verify 17/17).

## Problem

Hai vấn đề, cùng một gốc, nên làm chung một đợt.

**1. Ba bảng POS vẫn cộng footer theo trang.** Cùng lỗi đã sửa ở backoffice, nhưng khi đó cố tình
để ngoài phạm vi:

| Bảng | Footer tính ở | Phân trang |
| --- | --- | --- |
| Danh sách hóa đơn | `pos-web/src/hooks/page-hooks/invoice-list/use-invoice-list.ts:173-176` | Server thật ⇒ **số đổi ngay khi chuyển trang** |
| Lịch sử mua hàng (dialog KH) | `.../PurchaseHistoryTab.tsx:181` | Ghim `page:1, limit:100`; pager là trang trí |
| Đổi trả hàng | `.../ReturnInvoiceTable.tsx:149` | Ghim `page:1, limit:100`; hook không có state trang |

Hai bảng sau còn một lỗi nặng hơn: khách có hơn 100 hóa đơn thì phần còn lại **không bao giờ xem
được**, mà giao diện vẫn hiện thanh phân trang như thể có thể lật.

**2. "Tổng toàn tập" hiện có bốn hình dạng response khác nhau** — và một trong số đó đã là chuẩn
sẵn từ trước mà đợt 1 không dùng lại:

| Hình dạng | Nơi dùng |
| --- | --- |
| `{ rows, totals: ReportRow \| null, total }` | `shared-interfaces/src/invoice-report/search.ts:121-127` — báo cáo bán hàng; `inventory-report/search.ts:60-61` tái dùng nguyên vẹn |
| `totals: Record<string, number>` | 8 báo cáo kho (`modules/inventory-reports`) |
| `totals: StockSummaryTotals` | Tổng hợp tồn kho |
| `totalAmount` scalar | 3 phiếu kho, Quỹ tiền, đối soát tiền gửi |

Bốn cách nói cùng một điều. Người viết endpoint tiếp theo không có chỗ nào để tra "đúng ra phải trả
cái gì", nên hình dạng thứ năm chỉ là vấn đề thời gian.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Thu ngân POS | Xem "Tổng tiền" ở Danh sách hóa đơn, chuyển trang thì số đổi | Một bộ lọc cho một con số, bất kể đang ở trang nào |
| Nhân viên đổi trả | Chỉ thấy 100 hóa đơn đầu, không biết là đang bị cắt | Lật được tới hết; footer là tổng thật |
| Kế toán | Mở lịch sử mua hàng của khách: số "Tổng hóa đơn" và số tiền nói về hai tập khác nhau | Hai con số cùng nói về một tập |
| Developer | Bốn hình dạng totals, không có chuẩn để tra | Một kiểu trong `shared-interfaces`, có quy ước viết kèm |

## Success signal

Với cùng một bộ lọc, footer của cả **15** bảng (12 cũ + 3 POS) không đổi khi chuyển trang hoặc đổi
số dòng/trang — kiểm bằng unit test bất biến `limit` và bằng ảnh chụp ở G4. Và: mọi endpoint trong
phạm vi trả `totals` theo **một** kiểu khai trong `packages/shared-interfaces`.

Chỉ báo phụ: hai bảng dialog POS lật được tới trang cuối (hết cảnh cắt cụt ở 100 dòng).

## Out of scope

- **Họ `{ rows, totals: ReportRow | null, total }` của engine báo cáo giữ nguyên.** Nó đã chuẩn và
  đang được hai app dùng chung; `ReportRow` rộng hơn vì hàng totals ở đó đi qua cùng bộ render với
  hàng dữ liệu. Việc cần làm là ghi rõ ranh giới, không phải hợp nhất bằng mọi giá.
- `search-draft-invoices-v2.handler.ts` — không có footer tổng.
- Footer trong dialog chi tiết / biên lai POS: dữ liệu đã nạp đủ nên cộng ở client là đúng.
- Hai bất nhất "ô lọc khác đại lượng với cột" ở `search-returnable-invoices-v2.handler.ts:81` và
  `search-invoices-v2.handler.ts:47` — cùng loại với bất nhất sẽ sửa ở tab Lịch sử mua hàng, nhưng
  chủ sở hữu chưa yêu cầu; ghi thành việc riêng.
- Defect có sẵn của `getSummary` (`total` khác nhau giữa trang 1 và trang ≥2) — đã ghi ở đợt 1.

## Constraints

| Kind | Detail |
| --- | --- |
| Kiến trúc | Tổng do **server** tính, dùng chung hàm dựng truy vấn với lưới — footer không được phép lệch lưới |
| Kiến trúc | Một kiểu `totals` khai ở `packages/shared-interfaces`, không đẻ field scalar song song |
| Tương thích | Retrofit chỉ đổi **hình dạng**, không đổi con số: 17 bước verify của đợt 1 phải xanh y nguyên |
| Dữ liệu | Không migration, không cột mới. `invoices.total_amount` **không tồn tại** |
| `.ai/` | Không sửa `architecture.md` (mỗi feature tự mô tả); không nhét cấu hình chỉ đúng ở máy local vào `aidlc.yaml` dùng chung |
| Nền tảng | `apps/pos-web` **không có test runner** (`"test": "echo test"`, không vitest config) ⇒ FE verify bằng trình duyệt |
| Nền tảng | Cả ba DTO POS chặn `limit` ở `@Max(100)` — đừng thêm option 200 vào `pageSizeOptions` |

## Existing surface touched

**Mẫu để dùng lại, không phát minh:**
- `apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.handler.ts` —
  `buildQuery` gọi hai lần + `Promise.all`; spec `search-goods-receipts-v2.handler.spec.ts` là khuôn
  test (bất biến `limit`, "không join ở nhánh totals", "cùng bộ filter hai bên").
- `apps/api/src/modules/inventory/location/services/counterparty-name.util.ts:34-43` — factory sinh
  mảnh SQL theo alias, đem nạp cho `FilterBuilder`. Đây là mẫu cho `invoiceSignedTotalSql`.
- `apps/pos-web/src/hooks/page-hooks/invoice-list/use-invoice-list.ts` — tiền lệ phân trang server ở
  POS (state trong hook, reset trang ở mọi setter).
- `apps/pos-web/src/components/common/PosDataTable/PosDataTable.tsx` — đã có `summaryRow`; không sửa.

**Sẽ sửa:** `packages/shared-interfaces/src/common/index.ts`; `modules/pos/{services,queries,dto}`;
`modules/inventory/{goods-receipt,goods-issue,transfer}/queries` + `ledger/stock-summary.service.ts`;
`modules/inventory-reports`; và phía web: 3 trang phiếu kho, `InventoryManagementPage`,
`StorageReportShell`, 3 màn POS.

**Feature lân cận:** `footer-grand-totals` (đợt 1 — kịch bản verify 17 bước sẽ được copy sang đây để
chạy lại sau retrofit).

# Intent — transfer-summary-drilldown

## Problem

Khách hàng đối chiếu "Báo cáo > Tổng hợp nhập xuất điều chuyển" (`#transfer_in_out_summary`,
AC-BCK-06 của Phụ lục 01) với MISA eShop và nêu ba điểm. Khảo sát cho thấy chúng là ba loại vấn
đề khác nhau, không phải một.

### 1. Cột "Mã cửa hàng" luôn rỗng — lỗi một dòng

`transfer-report.service.ts:359` hard-code `branchCode: null`, kèm comment đã lỗi thời:

> `branches` table has no `code` column today — kept null for forward compat.

Cột **đã tồn tại** từ lâu: `branch.entity.ts:25`, `code?: string | null`, comment
*"Store code unique per organization — printed on barcode labels"*. Cột được khai đầy đủ ở cả
catalog backend (`transfer-summary.report.ts:36`) lẫn registry FE
(`report-transfer-in-out-summary.registry.ts:38`) và ghim trái — nên nó chiếm chỗ trên lưới và
không bao giờ có chữ.

Ràng buộc kèm theo: **seed hiện không ghi `code` cho branch nào** (`inventory.seed.ts:234, 512`;
`inventory-demo.seed.ts`), nên sửa service thôi vẫn ra ô rỗng trên máy dev.

### 2. Con số phi lý: "xuất 127 mà nhập về 173"

Đây là defect thật, không phải hiểu nhầm. Báo cáo dựng từ **hai luồng chứng từ độc lập**
(`transfer-report.service.ts:232-330`, 6 nhánh `UNION ALL`):

| Luồng | Bảng | Ghi nhận |
|---|---|---|
| Cũ, một pha | `stock_transfers` + lines, `status='POSTED'` | POSTED ghi cả hai chân nguyên tử ⇒ `out = received` |
| Mới, hai pha | `goods_issues` (`purpose='TRANSFER_OUT'`) và `goods_receipts` (`purpose='TRANSFER_IN'`) | hai chứng từ riêng, hai `posted_at` riêng |

Mấu chốt: **hai chân không hề join với nhau.** `goods_receipts` không có FK về `goods_issues`.
Nhánh thứ 6 (`:313-328`) quy phiếu nhập về `gr.source_branch_id` và gọi đó là "thực nhận" — tức
hai vế chỉ được ghép theo **cặp chi nhánh**, mỗi vế lọc theo `posted_at` của *chứng từ của chính
nó*. Ba hệ quả:

- **Biên kỳ.** Phiếu xuất post 28/12/2025, phiếu nhập post 03/01/2026 → kỳ 2026 đếm chân nhận mà
  không đếm chân xuất ⇒ `received > out`. Đây là nguyên nhân chính của "xuất 127 nhập về 173".
- **Không có trần.** Không gì chặn nơi nhận post phiếu nhập lớn hơn số đã xuất, hoặc nhập một lô
  thành hai phiếu. Sai sót nhập liệu đi thẳng vào `received`.
- **Đếm trùng giữa hai luồng.** Một lần điều chuyển chạy bằng `stock_transfers` (đã tự cộng cả
  `out` lẫn `received`) mà nơi nhận **lại** post thêm `goods_receipt` TRANSFER_IN ghi
  `source_branch_id` là chi nhánh nguồn ⇒ `received` cộng hai lần, `out` một lần.

Hiện `qtyDifference = received − out` do đó có thể dương, và khi dương thì không mang nghĩa gì cả.

Liên kết cần thiết **đã tồn tại**, chỉ chưa ai dùng: cả hai chân của luồng hai pha cùng trỏ về
`transfer_orders.id` — `goods_issues.reference_type='TRANSFER_ORDER'` và
`goods_receipts.reference_type='STOCK_TRANSFER'` (tên enum gây hiểu nhầm: nó trỏ
`transfer_orders.id`, **không** phải `stock_transfers.id` — xác nhận tại
`transfer-order.service.ts:1281, :1415`).

### 3. Không có truy xuất nguồn gốc — chưa tồn tại, không phải hỏng

MISA cho khoan xuống ba tầng; ta không có tầng nào. `grep -rn "drill" apps/backoffice-web/src/pages/reports/`
không ra kết quả nào.

| Tầng | Mở từ | Dialog |
|---|---|---|
| L1 | ô **Tên cửa hàng** | "CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG" — một dòng mỗi chi nhánh đối ứng, cùng bộ dải cột |
| L2 | 3 ô số lượng đầu của L1 | "CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG VÀ CHỨNG TỪ" — grain dòng chứng từ, có cột **Tham chiếu** = số phiếu ghép |
| L3 | ô **Chênh lệch thực nhận** của L1 | "CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN" — chỉ những chân chưa ghép; cột Tham chiếu rỗng, và đó chính là ý nghĩa |

Hạ tầng drill-down **đã có sẵn và đã verify xanh** từ feature [[sales-report-km-and-drilldown]]:
`resolveDrillDown` (`_lib/report-drilldown.ts:153`), `ReportDrillDownDialog` (báo cáo lồng trong
`AppModal` trên cặp provider lồng), `buildDrillDownReportState` (`report.factory.ts:97`). Feature
[[report-drilldowns-profit-debt]] đã lập tiền lệ "report type chỉ dùng trong dialog". Cần thêm ba
thứ: ba report type mới, một cờ `link` cho catalog inventory, và cho `ReportDrillDownBody` tự mount
lại `ReportDrillDownMount` để dialog mở được dialog.

### Bối cảnh phạm vi

Stack SINGLE (`TransferSummaryReportPage`, `StorageReportShell`, 8 trang `/reports/storage/*`,
`inventory-reports.controller.ts`) **đã bị xoá trong working tree** bởi
[[stock-by-store-branch-scope]] UOW-02. `App.tsx` route `/reports/inventory` sang `ReportPage` cho
cả SINGLE lẫn CHAIN, nên **một bản cài đặt phục vụ cả hai chế độ xem**. Nếu UOW-02 đó bị revert,
xem A-07.

## Success signal

- Cột "Mã cửa hàng" có chữ ở mọi dòng — trên máy dev cũng vậy, không chỉ trên dữ liệu khách.
- **`Chênh lệch thực nhận ≤ 0` là bất biến đúng theo cấu trúc**, không phải theo dữ liệu: tập dòng
  sinh ra `received` là tập con của tập dòng sinh ra `out`. Không còn con số nào cần giải thích.
- Cột đó mang đúng **một** nghĩa: *"đã xuất, chưa ai xác nhận nhận"*, và bấm vào nó liệt kê được
  đúng những phiếu ấy.
- Click "Tên cửa hàng" mở L1; footer L1 khớp dòng vừa click trên **cả sáu** chỉ tiêu (Σ dòng L1 ≡
  dòng cha vì L1 dùng đúng bốn vị ngữ của báo cáo cha, chỉ thêm `= $anchor`).
- Từ L1, click ô số lượng mở L2 với chiều xuất/nhập đúng và cột "Tham chiếu" giải được số phiếu
  ghép; click ô chênh lệch mở L3 với Tham chiếu rỗng mọi dòng và Σ Số lượng = |chênh lệch|.
- Không hồi quy: Báo cáo 2 (`inventory-document-detail`) và Báo cáo 7 (`transfer-by-store`) giữ
  nguyên số và nguyên hình.
- Bằng chứng ai-dlc-verify xanh trên `local-backoffice` với seed điều chuyển tất định — không phải
  ảnh chụp lưới rỗng.

## Out of scope

- **Chặn post phiếu nhập vượt số đã xuất.** Chạm luồng nghiệp vụ (`goods-receipt.service.ts`),
  rủi ro cao hơn hẳn phần đọc. Người dùng đã cân nhắc và chọn không làm ở feature này.
- **Ô "Chênh lệch thực nhận" trên báo cáo cha không click được.** MISA chỉ mở dialog chênh lệch từ
  tầng đối ứng: một dòng L1 đặt tên được một cặp chi nhánh, dòng cha thì không. Mở từ cha sẽ cần
  một biến thể truy vấn không-cặp và một phụ đề không gọi tên được cửa hàng nhập.
- **Thống nhất cơ sở giá giữa hai luồng.** Luồng hai pha dùng `gil.unit_price` (giá giao dịch
  thật), luồng legacy dùng `items.purchase_price` (giá vốn hiện tại, trôi theo thời gian) — dù
  `stock_transfer_lines.unit_price` có tồn tại (`:54-71`). L2/L3 **cố ý lặp lại** sai lệch này để
  drill-down cộng đúng về ô vừa click. Sửa là feature riêng, phải sửa cả Báo cáo 6.
- **Migrate 8 trang báo cáo kho sang stack chain** — đang do [[stock-by-store-branch-scope]] làm.
- **Sửa regex `AC_ID` trong `verify.py`** (`r"\bAC-\d+\b"` không khớp `AC-BCK-06`, khiến bảng
  Coverage của [[phu-luc-01-audit]] rỗng dù 40/40 bước xanh). Lỗi thật của skill, khác chủ đề; ở
  đây chỉ né bằng cách dùng mã `AC-\d+`.
- **Backfill dữ liệu lịch sử.** Toàn bộ thay đổi nằm ở tầng đọc.

## Constraints

- `goods_issues` / `goods_receipts` / `stock_transfers` đã POSTED là **bất biến**. Mọi sửa chữa ở
  tầng đọc; không migration dữ liệu.
- Liên kết chỉ ở **mức chứng từ, không mức dòng**: `gi.reference_id = gr.reference_id =
  transfer_orders.id`. Không có cặp dòng-với-dòng, chỉ chung `item_id`.
- **Không** dùng `transfer_orders.export_goods_issue_id` / `import_goods_receipt_id`: chúng bị set
  NULL khi phiếu nhập bị xoá/đảo (`goods-receipt.service.ts:624-640`) nên mất mát với lịch sử.
- `branch_id` trên `BaseEntity` là **varchar**, còn `target_branch_id` và
  `stock_transfers.*_branch_id` là **uuid**. Sai cast là lỗi lúc chạy, không phải lúc biên dịch.
- `ValidationPipe` toàn cục dùng `whitelist + forbidNonWhitelisted`: field DTO mới (`transferLeg`)
  phải khai đầy đủ, nếu không request 400.
- Sửa `InventoryReportFilterDto` kéo theo `pnpm openapi:generate` + commit `openapi.snapshot.json`
  và `packages/api-client/src/generated/schema.ts`. Snapshot hiện còn 8 path
  `GET /reports/inventory/*` mà [[stock-by-store-branch-scope]] đã xoá — regenerate **một lần**,
  sau khi UOW-02 đó land.
- `ReportUrlSync` ghi URL hash nên **không** được mount trong dialog; `ReportPageHeader` cũng
  không (phạm vi dialog do dòng vừa click quyết định). Ràng buộc kế thừa từ
  [[sales-report-km-and-drilldown]] ADR-01.
- `report-definitions.guard.spec.ts:51,57` chỉ miễn trừ `transfer-summary.report.ts` khỏi luật cấm
  `paginateRows` / `total: rows.length`. Report definition mới **phải phân trang trong SQL**.
- Chuỗi hiển thị tiếng Việt; mã nguồn backend tiếng Anh.

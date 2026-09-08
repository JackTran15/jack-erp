---
feature: stock-transfer-print-export
adr_count: 2
---

# Logical design — In / Xuất khẩu phiếu chuyển kho

## Approach

Không có thiết kế mới. Phiếu chuyển kho trở thành **chứng từ kho thứ tư** đi qua seam sẵn có
của `export-print` (ADR-05/06/10 ở feature đó):

```
StockTransferService.getPrintPayload(id, actor)
  = getById (org-scoped) + loadVoucherBranch(sourceBranchId)
  → mapStockTransferToVoucherPayload(transfer, branch)      // pure, mới
  → VoucherPrintPayload { kind: STOCK_TRANSFER, ... }
       ├─ GET :id/print-payload  → FE: renderVoucherHtml → printHtmlDocument (iframe + window.print)
       └─ GET :id/export         → ExportPipeline(StaticRowsFetcher, VoucherXlsxWriter, HttpResponseSink)
```

Mapper chép cấu trúc của `goods-issue-print.mapper.ts` (cột tiền + `amountInWordsVi`) và
`transfer-order-print.mapper.ts` (cột Kho xuất / Vị trí xuất / Kho nhập, tiêu đề). Khác biệt duy
nhất so với Lệnh điều chuyển: dòng chuyển kho **có** `unitPrice`/`lineValue` và
`destinationStorage`/`destinationLocation`, nên đủ mọi cột của file mẫu MISA và có dòng "Số tiền
viết bằng chữ". FE chỉ thêm hai mục vào hai bảng route khóa theo `VoucherKind` và bật hai nút.

## Alternatives rejected

| Phương án                                                            | Vì sao bỏ                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dùng lại `VoucherKind.TRANSFER_ORDER` cho phiếu chuyển kho             | Hai bảng route FE (`PRINT_PAYLOAD_PATH`, `EXPORT_PATH`) khóa theo kind; hai chứng từ có route khác nhau ⇒ phải đổi chữ ký `fetchVoucherPrintPayload` |
| Dựng phiếu chuyển kho từ cặp phiếu Xuất/Nhập của nó                    | Phiếu chuyển kho ghi sổ trực tiếp (`post` → ledger), không có `exportGoodsIssueId`/`importGoodsReceiptId` như Lệnh điều chuyển |
| Sinh PDF phía server                                                  | `export-print` đã chốt không thêm puppeteer/wkhtmltopdf; In = hộp thoại in trình duyệt                       |
| Thêm cột vào `VoucherXlsxWriter`/`renderVoucherHtml` cho riêng chuyển kho | Renderer data-driven theo `lineColumns`; không cần và không được đụng                                     |

## Domain model

| Entity                    | Fields dùng để in                                                                                                  | Notes                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `StockTransferEntity`     | documentNumber, transferredAt, createdAt, sourceBranchId, notes, counterparty (transient), transporter (transient), lines | `getById` đã inline counterparty/transporter |
| `StockTransferLineEntity` | item(code,name,unit,sellingPrice), sourceStorage.name, sourceLocation.name, destinationStorage.name, destinationLocation.name, quantity, unitPrice, lineValue, notes | Tất cả eager                            |
| `VoucherPrintPayload`     | thêm `VoucherKind.STOCK_TRANSFER`                                                                                  | `@erp/shared-interfaces`                |
| `VOUCHER_COLUMN_WIDTHS`   | thêm khóa `destPosition: 13`                                                                                       | cùng bề rộng `sourcePosition`           |

## Contracts

### GET /inventory/stock/transfers/:id/print-payload
Quyền: `inventory.transfer.read`. Scope: org. Response 200: `VoucherPrintPayload`
```json
{ "kind": "STOCK_TRANSFER", "paper": "A4", "title": "PHIẾU CHUYỂN KHO", "docNo": "CK000123",
  "docDate": "7 tháng 5 năm 2026", "branch": { "name": "…", "address": "…", "phone": null },
  "info": [ { "label": "Người vận chuyển", "value": "…" }, { "label": "Diễn giải", "value": "…" } ],
  "lineColumns": [ "stt","sku","name(span 4)","sourceWarehouse","sourcePosition","destWarehouse","destPosition","uom","quantity","unitPrice","lineTotal","salePrice(hidden)","saleTotal(hidden)","note(hidden)" ],
  "lines": [], "totals": null, "totalsLabel": "Tổng", "amountInWords": "…", "signatures": ["Người lập phiếu","Người nhận hàng","Thủ kho","Kế toán trưởng","Giám đốc"] }
```
Failure: 401 (AuthGuard), 403 (thiếu quyền), 404 (`findOrFail` — khác org hoặc không tồn tại).

### GET /inventory/stock/transfers/:id/export
Quyền/scope như trên. Response 200 stream `.xlsx`, `Content-Disposition: attachment; filename="phieu-chuyen-kho.xlsx"`
(do `HttpResponseSink(res, payload.title)` + `toFileSlug`). Failure như trên.

## State ownership

| State                | Owner                                  | Lifetime            |
| -------------------- | -------------------------------------- | ------------------- |
| `printing`/`exporting` | `TransferFormDialog` (local `useState`) | Dialog              |
| Payload in           | không cache — fetch mỗi lần bấm        | Một lần bấm         |

## Error taxonomy

| Condition                         | Failure                              | UI                                                     |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Phiếu không thuộc org / không có   | 404 `NotFoundException` từ `findOrFail` | `toast.error(getUserFacingApiErrorMessage)`; nút mở khóa lại |
| Thiếu quyền `inventory.transfer.read` | 403 từ `PermissionGuard`           | toast lỗi                                              |
| Phiếu chưa lưu (`mode === "create"`) | không gọi API                        | nút disabled                                           |
| Kho/vị trí/item bị xóa mềm         | ô trống (`?? null`)                  | phiếu vẫn in                                           |

## Cache & offline
Không cache. Không có yêu cầu offline.

## Observability
Route đi qua `AuditInterceptor` của controller như các GET khác; lỗi 4xx hiện toast. Không thêm sự kiện.

## ADRs

### ADR-01 — Thêm `VoucherKind.STOCK_TRANSFER` thay vì dùng chung `TRANSFER_ORDER`
**Context:** FE dispatch route theo kind; Lệnh điều chuyển và phiếu chuyển kho là hai bản ghi, hai controller.
**Decision:** Thêm giá trị enum thứ 8; renderer không đổi vì không switch theo kind.
**Consequences:** Phải rebuild `@erp/shared-interfaces`; comment "7 voucher kinds" cập nhật thành 8.
**Status:** accepted

### ADR-02 — Route in/xuất scope theo org, không `@RequireBranchScope`
**Context:** Phiếu chuyển kho có thể liên chi nhánh; `StockTransferService.getById(id, organizationId)` đã org-scoped; Lệnh điều chuyển làm y hệt và e2e đã ghi nhận.
**Decision:** Hai route mới chỉ dùng `@RequirePermission('inventory.transfer.read')`, gọi `getById` org-scoped.
**Consequences:** Cùng org, chi nhánh khác vẫn in được (AC-06); khác org 404 (AC-05).
**Status:** accepted

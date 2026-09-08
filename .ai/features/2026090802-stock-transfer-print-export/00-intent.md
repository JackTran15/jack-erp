---
feature: stock-transfer-print-export
slug: 2026090802-stock-transfer-print-export
owner: Loc Tran
created: 2026-09-08
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — In / Xuất khẩu phiếu chuyển kho

Nguồn: báo lỗi ngày 2026-09-08 "Chưa In/Xuất khẩu phiếu chuyển kho được", kèm 2 file mẫu MISA
(`Phieu_chuyen_kho.pdf`, `XuatKhauChuyenKho.xlsx`). Yêu cầu: làm theo cấu trúc hiện tại, cho
giống phiếu Nhập / phiếu Xuất.

## Problem

Trang **Kho hàng → Chuyển kho** (`/inventory/stock-transfers`) mở phiếu ra có hai nút **In** và
**Xuất khẩu** trên thanh công cụ, nhưng cả hai bị khóa cứng (`disabled: true`, `onClick` rỗng —
`StockTransferPage.tsx:1167-1168`). Người dùng không có cách nào in phiếu chuyển kho ra giấy để
ký, hay xuất ra Excel để gửi kế toán, trong khi phiếu Nhập kho và Xuất kho ngay bên cạnh đã làm
được từ feature `export-print`.

Về mặt kỹ thuật, nền tảng in/xuất chứng từ (`VoucherPrintPayload` → `renderVoucherHtml` /
`VoucherXlsxWriter`) đã phủ Nhập kho, Xuất kho và **Lệnh điều chuyển** (`transfer-order`), nhưng
chưa phủ **phiếu chuyển kho** (`stock-transfer`, module `inventory/transfer/`): không có route
`print-payload` / `export`, không có mapper, và `VoucherKind` không có loại tương ứng nên FE không
có đường gọi.

## Affected personas

| Persona          | Hành vi hiện tại                                              | Hành vi mong muốn                                                        |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Thủ kho          | Chép tay phiếu chuyển kho hoặc chụp màn hình để ký nhận        | Bấm In → phiếu A4 "PHIẾU CHUYỂN KHO" có bảng hàng, tổng, ô ký như MISA    |
| Kế toán kho      | Không có file Excel phiếu chuyển kho để lưu / đối chiếu        | Bấm Xuất khẩu → `phieu-chuyen-kho.xlsx` cùng bố cục file mẫu MISA          |
| Developer        | Nút tồn tại nhưng chết; mỗi loại phiếu tự phát minh cách in    | Cùng một seam với Nhập/Xuất: thêm mapper + 2 route, không thêm renderer    |

## Success signal

Trên phiếu chuyển kho đã lưu bất kỳ: bấm **In** mở hộp thoại in của trình duyệt với phiếu đủ 5 khối
(đầu phiếu, thông tin, bảng hàng, tổng + số tiền bằng chữ, ô ký); bấm **Xuất khẩu** tải về file
`.xlsx` mở được, có đúng các cột của file mẫu MISA. Kiểm chứng bằng unit test mapper, e2e phạm vi
org, và ảnh chụp ở G4.

## Out of scope

- **Lệnh điều chuyển** (`/inventory/transfer-orders`) — đã in/xuất được, không đụng.
- **In ra PDF phía server** — feature `export-print` đã chốt không có puppeteer/wkhtmltopdf; in =
  hộp thoại in của trình duyệt.
- **Đổi bố cục renderer** (`render-voucher-html.ts`, `voucher-xlsx.writer.ts`) — hai file này
  data-driven, mọi khác biệt nằm ở payload.
- **Phiếu chuyển kho hệ thống sinh** (`isSystemGenerated`) có quy tắc riêng — in như phiếu thường.
- **Cột "Serials"** trong file mẫu MISA — hệ thống không quản lý serial.

## Constraints

| Kind       | Detail                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Kiến trúc  | Dùng nguyên seam `VoucherPrintPayload` + `ExportPipeline`/`VoucherXlsxWriter`/`HttpResponseSink`; không thêm dependency |
| Kiến trúc  | Mapper thuần (pure), test được không cần DB — như 3 mapper sẵn có                                          |
| Bảo mật    | Route mới scope theo `organizationId`; khác org phải 404 không lộ trường (giống e2e `voucher-print-payload`) |
| Tương thích| Thêm giá trị enum vào `@erp/shared-interfaces` ⇒ phải `pnpm build:shared`; thêm route ⇒ `pnpm openapi:generate` và commit file sinh ra |
| Nền tảng   | Desktop, `vi-VN`; In dùng iframe ẩn + `window.print()` nên không tự động hóa được trong Playwright          |

## Existing surface touched

**Mẫu có sẵn để chép:**
- `apps/api/src/modules/inventory/goods-issue/goods-issue-print.mapper.ts` — cột có Đơn giá /
  Thành tiền, `amountInWordsVi`, cột ẩn Giá bán.
- `apps/api/src/modules/inventory/transfer-order/transfer-order-print.mapper.ts` — cột Kho xuất /
  Vị trí xuất / Kho nhập, tiêu đề "PHIẾU CHUYỂN KHO".
- `apps/api/src/modules/inventory/transfer-order/transfer-order.controller.ts:424-448` — hai route
  `print-payload` + `export` (streaming qua `@Res()`).
- `apps/api/src/modules/inventory/location/services/voucher-print-context.util.ts` — `loadVoucherBranch`.
- `apps/backoffice-web/src/pages/transfer-orders/TransferOrdersPage.tsx:1235-1263` — `handlePrint` /
  `handleExport` + hai mục toolbar.
- `apps/backoffice-web/src/lib/print/{voucher-print.api.ts,voucher-export.api.ts}` — bảng route theo `VoucherKind`.

**Sẽ sửa:**
- Shared: `packages/shared-interfaces/src/printing/voucher-payload.ts`, `apps/api/src/modules/inventory/voucher-column-width.const.ts`.
- API: `apps/api/src/modules/inventory/transfer/{stock-transfer.service.ts,stock-transfer.controller.ts}`, mapper mới + spec.
- Web: `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`, hai file route ở `lib/print/`.
- Test: `apps/api/test/e2e/voucher-print-payload.e2e-spec.ts`.

**Feature lân cận:** `export-print` (nền tảng), `transfer-receipt-cross-branch-reference` (tiền lệ
cách xác minh In/Xuất khẩu bằng curl vì hộp thoại in treo phiên tự động).

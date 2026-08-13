---
feature: line-item-grid-column-filter
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Bộ lọc theo cột trong lưới chi tiết chứng từ

`LineItemGrid` (`packages/ui/src/components/line-item-grid.tsx`) always rendered a per-column
filter row, but it was fully controlled: the input was pinned to `""` and the change handler
returned early whenever the caller passed no `onFilterChange`. In Phiếu nhập kho / Phiếu xuất
kho — and 7 other document grids — the filter boxes could not accept a single keystroke.

The grid now filters its own rows when the caller does not take the filters over, and hands
callbacks the source row index so edits and deletes still address the intended line while a
filter is active.

## Steps

| ID | Step | Path | Interaction | Verifies |
|---|---|---|---|---|
| S1 | Chi nhánh HCM được chọn, danh sách phiếu nhập kho hiển thị NK000003 | `/inventory/purchase-orders` | `click button.w-52; click [role="menuitemradio"]:has-text("HCM")` | AC-01 |
| S2 | Phiếu nhập kho NK000003 mở ra với đủ 1528 dòng, chưa lọc | `/inventory/purchase-orders` | `click button:has-text("NK000003")` | AC-01 |
| S3 | Lọc cột Mã SKU "TX1701" thu hẹp lưới còn 2 dòng khớp | `/inventory/purchase-orders` | `click button:has-text("NK000003"); fill input[aria-label="Lọc Mã SKU"] = TX1701` | AC-02 |
| S4 | Lọc cột Kho "showroom" (không phân biệt hoa thường) hoạt động | `/inventory/purchase-orders` | `click button:has-text("NK000003"); fill input[aria-label="Lọc Kho"] = showroom` | AC-03 |
| S5 | Cột số "≤" lọc theo giá trị: Đơn giá ≤ 330.000 | `/inventory/purchase-orders` | `click button:has-text("NK000003"); fill input[aria-label="Lọc Đơn giá"] = 330000` | AC-04 |
| S6 | Không có dòng khớp hiển thị thông báo riêng, tổng cuối lưới vẫn là tổng toàn phiếu | `/inventory/purchase-orders` | `click button:has-text("NK000003"); fill input[aria-label="Lọc Mã SKU"] = zzzzzz` | AC-05 |
| S7 | Phiếu xuất kho: ô lọc nhận được ký tự (trước đây không gõ được) | `/inventory/goods-issues` | `click button:has-text("Thêm mới"); fill input[aria-label="Lọc Mã SKU"] = zzzzzz` | AC-06 |
| S8 | Chuyển kho CK000001: lọc Mã SKU đúng mã thì giữ lại dòng | `/inventory/stock-transfers` | `click button:has-text("CK000001"); fill input[aria-label="Lọc Mã SKU"] = ABA2777` | AC-06 |
| S9 | Chuyển kho CK000001: lọc Kho xuất không khớp thì báo không tìm thấy | `/inventory/stock-transfers` | `click button:has-text("CK000001"); fill input[aria-label="Lọc Kho xuất"] = zzzzzz` | AC-06 |
| S10 | Lệnh điều chuyển: ô lọc nhận được ký tự | `/inventory/transfer-orders` | `click button:has-text("Thêm mới"); fill input[aria-label="Lọc Mã SKU"] = zzzzzz` | AC-06 |
| S11 | Kiểm quỹ, tab Thành viên tham gia: ô lọc Họ tên nhận được ký tự | `/treasury/cash/count` | `click button:has-text("Thêm mới"); click [role="dialog"] button:has-text("Kiểm kê tiền mặt"); click [role="dialog"] button:has-text("Thành viên tham gia"); fill input[aria-label="Lọc Họ tên"] = zzzzzz` | AC-06 |
| S12 | Phiếu thu PT000001 ở chế độ sửa: lọc Diễn giải "POS" giữ lại dòng khớp | `/treasury/cash/receipts-expenses` | `click button:has-text("PT000001"); click [role="dialog"] button:has-text("Sửa"); fill input[aria-label="Lọc Diễn giải"] = POS` | AC-06 |
| S13 | Phiếu thu PT000001 ở chế độ sửa: lọc Diễn giải không khớp thì báo không tìm thấy | `/treasury/cash/receipts-expenses` | `click button:has-text("PT000001"); click [role="dialog"] button:has-text("Sửa"); fill input[aria-label="Lọc Diễn giải"] = zzzzzz` | AC-06 |
| S14 | Phiếu thu tiền gửi (tạo mới): ô lọc Diễn giải nhận được ký tự | `/treasury/deposit/receipts-expenses` | `click button:has-text("Thêm mới"); click [role="menu"] >> text="Phiếu thu tiền gửi"; fill input[aria-label="Lọc Diễn giải"] = zzzzzz` | AC-06 |

## Not verified here

- **AC-07 (chỉ số dòng nguồn)** — that a cell edit or a row delete performed *while a filter is
  active* lands on the intended line. NK000003 is posted, so its dialog is read-only, and the
  four-verb interaction grammar cannot express "edit a cell, clear the filter, re-check the
  value". Covered by construction — the grid passes `LineItemRow` the source index rather than
  the visible position, so no consumer callback ever sees a shifted index — and checked by hand
  in the browser on an unsaved draft.
- **Dialogs with no data in this database** — `goods_issues`, `transfer_orders`, `bank_receipts`
  and `cash_counts` are all empty, so S7, S10, S11 and S14 open a new document and exercise an
  empty grid. They still cover the reported defect for those dialogs — before the fix the filter
  input could not receive a character — but multi-row narrowing there rests on the shared grid
  behaviour proven with real data on NK000003 (S3–S6), CK000001 (S8–S9) and PT000001 (S12–S13).
- **Treasury vouchers in view mode** render `BaseDataTable`, not `LineItemGrid` (see the
  `readOnly ?` branch in each voucher dialog), and that read-only table shows no filter row at
  all. S12–S13 therefore open the voucher with **Sửa**, which is where `LineItemGrid` is used.
  Whether the read-only view should offer filtering is a separate product question.
- **Column keys resolve** — every filter column in the 7 other grids either has a `getValue` or a
  key that is a real field on the row type (checked against `FormLine` in `StockTransferPage`,
  `TransferOrdersPage`, `CashCountParticipant`, and the four voucher dialogs). The synthetic-key
  problem that made Kho / Vị trí inert exists only in the two goods dialogs and is fixed there.
- **The 4 grids that already wired filters themselves** (Kiểm kê kho, In tem mã vạch and the two
  promotion grids) keep the controlled code path unchanged; regression checked by hand.

## Notes

Run against branch **HCM** — it is the only branch holding goods receipts, and S1 switches to it
(the choice persists in `localStorage.active_branch_id` for the later steps). The date range
defaults to "Tháng này", which contains NK000003 (12/08/2026).

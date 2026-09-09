# Intent — voucher-revision-projection

## Problem

Sửa một phiếu thu/chi **lần thứ hai** luôn trả 409:

```
PATCH /cash-receipts/cbab9fb3-… -> 409
Phiếu thu đã được người khác sửa (bản 1, bạn đang giữ bản 0). Tải lại phiếu rồi thử lại.
```

Không có ai sửa đồng thời. `revision` là token chống ghi đè, và lưới **không bao giờ** nhận
được giá trị thật của nó:

- `SearchCashVouchersV2Handler` tính `r.revision AS revision` trong CTE (`:54`, `:83`) nhưng
  câu `SELECT` ngoài cùng của `dataSql` (`:149-151`) **không liệt kê nó**. Cột tồn tại trong
  `combined`, không bao giờ ra khỏi đó.
- `SearchDepositVouchersV2Handler` y hệt (`:53`, `:76` trong CTE; `:152-154` thiếu).
- `CashVoucherRowDto.revision` / `DepositVoucherRowDto.revision` vẫn khai trường đó, nên hợp
  đồng OpenAPI hứa một trường mà truy vấn không trả.
- Hai adapter FE viết `revision: row.revision ?? 0` (`cash-vouchers.adapters.ts:51`,
  `receipt-deposit.utils.ts:26`). `?? 0` biến `undefined` thành **0** — đây là chỗ lỗi trở nên
  im lặng: không cảnh báo, không `undefined` lọt tới server, chỉ là một con số sai hợp lệ.
- `TreasuryCashReceiptsPage.tsx:484` gửi `revision: selectedItem?.revision ?? 0`, mà
  `selectedItem` lấy từ chính dòng lưới (`:183`), không phải từ lời gọi chi tiết.

Hệ quả đúng như quan sát ngày 2026-09-09: phiếu chưa sửa lần nào (`revision = 0`) thì sửa
được — PC000044; phiếu đã sửa một lần (`revision = 1`) thì hỏng vĩnh viễn — PT004767.

Đây là khiếm khuyết của phần **chưa commit** thuộc
`.ai/features/2026090804-treasury-voucher-party-address-print-export/`. Mở feature riêng thay
vì `reopen` feature đó vì kế hoạch bên đó không hề nói tới đường đi của `revision` (nó đến từ
`2026090701`), và feature đó đang chờ ký G4 — thêm ticket vào sẽ làm mất trạng thái đó.

## Success signal

Sửa PT004767 (phiếu đang ở `revision = 1`) hai lần liên tiếp đều thành công, không có 409 nào
trong log. Lặp lại trên một phiếu chi tiền mặt và một phiếu thu/chi tiền gửi.

## Out of scope

- Đổi cơ chế khoá lạc quan (`revision`) sang cách khác.
- Bỏ `?? 0` ở hai adapter: nó là mặc định đúng cho một phiếu vừa tạo; cái sai là dữ liệu đi
  vào nó, không phải bản thân nó.
- Bốn cột mới của `.ai/features/2026090901-voucher-party-person-columns/` — đã xong, và ảnh
  chụp ngày 2026-09-09 xác nhận chúng hiển thị đúng.
- Hai sổ (`cash-ledger`, `deposit-ledger`): chúng không phải đường sửa phiếu và không mang
  `revision`.

## Constraints

- **UNION ALL**: `revision` phải xuất hiện đúng vị trí ở cả hai nhánh — nhánh dưới khớp theo
  thứ tự, không theo tên. Nó đã có sẵn ở cả hai CTE, nên việc phải làm chỉ nằm ở câu `SELECT`
  ngoài cùng.
- `totalsSql` **không** cần cột này (nó chỉ `COUNT`/`SUM`), đừng thêm vào đó.
- **Hợp đồng OpenAPI KHÔNG đổi**: `revision` vốn đã khai trong cả hai row DTO — sai lệch nằm ở
  truy vấn, không ở khai báo. Vì vậy feature này *không* cần `openapi:generate`, và nếu thấy
  mình sắp chạy nó thì có nghĩa đã sửa nhầm chỗ.
- Backend source tiếng Anh.

# Intent — voucher-party-person-columns

## Problem

Phiếu thu/chi (tiền mặt và tiền gửi) lưu **hai** danh tính khác nhau cho một giao dịch:

- **Đối tượng nộp/nhận** — bên đối tác của giao dịch. Lưu ở `partner_name_snapshot`
  (đóng băng tại thời điểm ghi sổ; kèm `partner_id` khi chọn từ danh mục, NULL khi gõ tay
  loại `OTHER`).
- **Người nộp/nhận** — cá nhân trực tiếp giao/nhận tiền. Lưu ở `cash_receipts.payer_name`
  / `cash_payments.payee_name` (và cặp tương ứng bên `bank_receipts` / `bank_payments`).

Giao diện phiếu hiển thị đủ cả hai (ảnh 2: "Đối tượng nhận = kkkk", "Người nhận = 123123"),
nhưng **mọi lưới danh sách chỉ có một cột** gộp hai trường bằng `COALESCE`. Hệ quả là một
trong hai giá trị luôn bị giấu, và không thể lọc/xuất khẩu theo từng trường.

Tệ hơn, bốn câu SQL đang coalesce theo **ba thứ tự khác nhau**, nên cùng một nhãn
"Đối tượng nộp/nhận" mang nghĩa khác nhau tuỳ màn hình:

| Nguồn | Thứ tự COALESCE | Nghĩa thực tế của cột |
|---|---|---|
| `search-cash-vouchers-v2.handler.ts:47-52,80-85` | `payer_name` → `partner_name_snapshot` | **người** |
| `search-deposit-vouchers-v2.handler.ts:55-59,77-80` | `payer_name`/`payee_name` → `partner_name_snapshot` | **người** |
| `cash-ledger.service.ts:132-137` | `cp.partner_name_snapshot` → `cp.payee_name` → `cr.partner_name_snapshot` → `cr.payer_name` | **đối tượng** |
| `deposit-ledger.service.ts:119-125` | `br.payer_name` → `bp.payee_name` → `br.partner_name_snapshot` → `bp.partner_name_snapshot` | **người** |

Ảnh 1 là hệ quả trực tiếp: lưới Thu chi tiền mặt hiện `123123` (Người nhận) ở cột nhãn
"Đối tượng nộp/nhận", trong khi đối tượng thật (`kkkk`) không xuất hiện ở đâu trên lưới.

## Success signal

Trên cả 4 lưới, phiếu PC000040 (đối tượng `kkkk`, người nhận `123123`) hiển thị **hai cột
riêng**: "Đối tượng nộp/nhận" = `kkkk`, "Người nộp/nhận" = `123123`. Mỗi cột lọc được độc
lập ở server, và cột "Đối tượng nộp/nhận" của một phiếu chỉ điền "Người nộp" trả về **rỗng**
chứ không mượn giá trị cột bên cạnh. File Excel xuất từ lưới Thu chi tiền mặt có đủ hai cột,
đúng thứ tự lưới.

## Out of scope

- Thêm cột "Địa chỉ" hoặc "Nhân viên thu/chi" vào lưới (Akenzy chốt 2026-09-09: không thêm).
- Đổi cách **nhập** hai trường trên dialog phiếu — luồng nhập đã đúng sau
  `.ai/features/2026090804-treasury-voucher-party-address-print-export/`.
- Backfill dữ liệu cũ. Phiếu cũ chỉ có `payer_name` sẽ để trống cột Đối tượng; đó là kết quả
  ĐÚNG theo A-02, không phải hồi quy.
- Cột "Đối tượng thu/chi" (nhân viên, `staff_id`) trên sổ quỹ tiền mặt và "Nhân viên" trên
  sổ tiền gửi — giữ nguyên, không đụng.
- `.ai/features/export-print/` UOW-04 và mọi việc In/Xuất phiếu lẻ.

## Constraints

- **4 màn hình, 4 câu SQL** (Akenzy chốt phạm vi 2026-09-09): Thu chi tiền mặt, Thu chi tiền
  gửi, Sổ quỹ tiền mặt, Sổ tiền gửi. Sau khi tách, cả 4 phải cho cùng một nghĩa cho cùng một
  nhãn — sự bất nhất ở bảng trên biến mất theo thiết kế, không cần một pha "đồng bộ" riêng.
- **Không fallback** (Akenzy chốt): mỗi cột đọc đúng một nguồn. `COALESCE(x, '')` chỉ để đổi
  NULL thành chuỗi rỗng, không để mượn cột khác.
- Cả 4 nguồn đều là **SQL thô** (`manager.query` / `repo.query`), không phải QueryBuilder —
  filter phải đi qua `applyString` sẵn có của từng handler, và phải nhớ `deleted_at IS NULL`
  không được TypeORM tự thêm.
- `search-cash-vouchers-v2` là **UNION ALL** hai bảng: mọi cột thêm vào phải xuất hiện ở cả
  hai nhánh, cùng kiểu, cùng thứ tự.
- Endpoint xuất khẩu dùng lại chính DTO/query của `search` (ADR-06 của feature 2026090804),
  nên `EXPORT_COLUMNS` phải đổi cùng lúc, nếu không file lệch lưới.
- Backend source tiếng Anh; chỉ nhãn hiển thị là tiếng Việt.
- Đổi hợp đồng API ⇒ phải chạy lại `pnpm openapi:generate` từ **build riêng ở :4100**
  (dev server :4000 phục vụ build cũ — xem `project_treasury_voucher_address_print_export`).

# TKT-DEP-06 navConfig — nhóm TIỀN GỬI còn 3 mục

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

Nhóm `TIỀN GỬI` trong sidebar đang có **9 mục**, trộn lẫn màn vận hành hằng ngày với màn thiết lập và báo cáo toàn hệ thống. Rút còn đúng **3 mục vận hành**; sáu mục còn lại **chuyển sang nhóm khác**, giữ nguyên route — không xoá tính năng, không sửa `App.tsx`.

## Deliverables

- `apps/backoffice-web/src/components/layout/navConfig.ts` — sắp xếp lại section `treasury-deposit` và thêm các mục đã chuyển vào nhóm đích.

## Hiện trạng (9 mục, section `id: "treasury-deposit"`, ~:186-200)

| # | Path | Nhãn | Xử lý |
| - | ---- | ---- | ----- |
| 1 | `/treasury/deposit/receipts-expenses` | Thu, chi tiền gửi | **giữ** (thứ 1) |
| 2 | `/treasury/deposit-reconciliation` | Đối chiếu tiền gửi | **giữ** (thứ 2) |
| 3 | `/treasury/deposit-period-lock` | Khóa sổ tiền gửi | chuyển |
| 4 | `/admin/deposit-accounts` | Tài khoản tiền gửi | chuyển |
| 5 | `/admin/deposit-payment-policy` | Chính sách thanh toán tiền gửi | chuyển |
| 6 | `/treasury/deposit/ledger` | Sổ chi tiết tiền gửi | **giữ** (thứ 3 — hiện đang đứng sau mục 5, phải đưa lên) |
| 7 | `/treasury/deposit-transfers` | Chuyển liên chi nhánh | chuyển |
| 8 | `/treasury/deposit-in-transit` | Tiền đang chuyển | chuyển |
| 9 | `/treasury/deposit-dashboard` | Số dư toàn hệ thống | chuyển |

## Acceptance Criteria

- [ ] Nhóm `TIỀN GỬI` còn **đúng 3** `NavChild`, đúng thứ tự: Thu, chi tiền gửi → Đối chiếu tiền gửi → Sổ chi tiết tiền gửi.
- [ ] Sáu mục còn lại vẫn **truy cập được từ sidebar** ở nhóm mới — không mục nào bị mồ côi.
- [ ] Nhóm đích chọn theo bản chất từng mục, không dồn hết vào một chỗ cho tiện:
  - `Tài khoản tiền gửi`, `Chính sách thanh toán tiền gửi` → nhóm thiết lập/danh mục (cùng chỗ với các màn `/admin/*` khác);
  - `Khóa sổ tiền gửi` → nhóm cùng cấp với khoá sổ quỹ tiền mặt nếu đã có, ngược lại nhóm thiết lập;
  - `Chuyển liên chi nhánh`, `Tiền đang chuyển`, `Số dư toàn hệ thống` → nhóm liên chi nhánh/báo cáo.
  - Trước khi đặt, **đọc các section hiện có trong `navConfig.ts`** và chọn nhóm đã tồn tại; chỉ tạo section mới khi thực sự không có chỗ phù hợp.
- [ ] Không sửa `App.tsx`, không đổi/xoá route nào.
- [ ] Permission gate của từng `NavChild` giữ nguyên như trước khi chuyển.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Click thử **cả 9** đường dẫn từ sidebar sau khi sắp xếp — không có 404, không mục nào biến mất.
- [ ] Không thêm route mới trong `App.tsx` (nav và route phải khớp nhau theo convention repo).

## Tech Approach

`navConfig.ts` là nguồn sự thật duy nhất của sidebar; thêm/bớt route đòi hỏi **cả** `<Route>` trong `App.tsx` **và** `NavChild` ở đây. Ticket này chỉ di chuyển `NavChild` giữa các section nên `App.tsx` không đổi.

Chỉ cắt-dán object `NavChild` (giữ nguyên `path`, `label`, và điều kiện permission) sang section đích, rồi sắp lại thứ tự trong `treasury-deposit`.

## Testing Strategy

- Thủ công: mở sidebar, xác nhận nhóm TIỀN GỬI đúng 3 mục đúng thứ tự; tìm và click đủ 6 mục đã chuyển.
- Kiểm với tài khoản **không** đủ permission cho một mục đã chuyển → mục đó vẫn ẩn đúng như trước.

## Dependencies

- Depends on: —
- Blocks: [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md)

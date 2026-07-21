# TKT-CTF-07 Trang "Chuyển tiền mặt liên chi nhánh"

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Trang theo dõi các lần chuyển tiền mặt liên chi nhánh: chi nhánh đích xác nhận đã nhận tiền, chi nhánh nguồn huỷ khi còn đang chuyển. Mirror thư mục `pages/treasury/deposit-transfer/`.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/cash-transfer/CashTransferListPage.tsx` (mới).
- `apps/backoffice-web/src/pages/treasury/cash-transfer/ConfirmCashReceiptDialog.tsx` (mới).
- `apps/backoffice-web/src/pages/treasury/cash-transfer/CancelCashTransferDialog.tsx` (mới).
- `apps/backoffice-web/src/pages/treasury/cash-transfer/cash-transfer.types.ts` + `cash-transfer.labels.ts` (mới).
- `apps/backoffice-web/src/App.tsx` — `<Route path="/treasury/cash-transfers">`.
- `apps/backoffice-web/src/components/layout/navConfig.ts` — `NavChild` mới.

## Acceptance Criteria

- [ ] Route `/treasury/cash-transfers` và `NavChild` nhãn **"Chuyển tiền mặt liên chi nhánh"**, đặt cạnh 2 dòng deposit hiện có (`/treasury/deposit-transfers`, `/treasury/deposit-in-transit`). Thiếu một trong hai (route hoặc nav) là chưa đạt.
- [ ] Bảng có cột: Ngày, Số phiếu chi (chân A), Cửa hàng chuyển, Cửa hàng nhận, **Hình thức nhận** (Tiền mặt / Tiền gửi), Tài khoản nhận, Số tiền, Trạng thái, Ghi chú, thao tác.
- [ ] Bộ lọc: trạng thái, chiều (`OUT`/`IN`), khoảng ngày; phân trang server-side qua `GET /cash-transfers`.
- [ ] Nút "Xác nhận" chỉ bật khi `status = DANG_CHUYEN` **và** chi nhánh đang hoạt động là chi nhánh đích; nút "Huỷ" chỉ bật khi `DANG_CHUYEN` **và** đang ở chi nhánh nguồn. Không dựa vào server trả 403 để ẩn nút.
- [ ] Dialog huỷ bắt buộc nhập lý do (1–500 ký tự), không cho submit rỗng.
- [ ] Sau xác nhận/huỷ: invalidate `["cash-transfers"]` và các key quỹ liên quan; hiện toast tiếng Việt.
- [ ] Trạng thái rỗng có thông báo tiếng Việt rõ ràng, không phải bảng trắng.
- [ ] **Không** có nút "Thêm mới" trên trang này — điểm tạo duy nhất là phiếu chi tiền mặt (khác `DepositTransferCreateDialog` của bản deposit).
- [ ] Nhãn trạng thái tiếng Việt: `DANG_CHUYEN` → "Đang chuyển", `HOAN_TAT` → "Hoàn tất", `DA_HUY` → "Đã huỷ"; giá trị enum giữ tiếng Anh trong code.
- [ ] Số tiền/ngày format `Intl` locale `vi-VN`; primitive từ `@erp/ui`; icon từ `lucide-react`; named export, không `export default`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Click-through thật: mở trang ở chi nhánh đích thấy dòng `DANG_CHUYEN`, bấm Xác nhận → status đổi + quỹ tăng (ảnh chụp trước/sau).
- [ ] Sidebar hiện mục mới đúng vị trí.
- [ ] Không tạo trang `*-v2` song song.

## Tech Approach

Sao chép cấu trúc `DepositTransferListPage.tsx` (bảng + filter + 2 dialog), thay hook sang `use-cash-transfers.ts`, thêm cột "Hình thức nhận".

```ts
const currentBranchId = useBranchStore((s) => s.branchId);
const canConfirm = (r: CashTransferRow) =>
  r.status === DepositTransferStatus.DANG_CHUYEN && r.toBranchId === currentBranchId;
const canCancel = (r: CashTransferRow) =>
  r.status === DepositTransferStatus.DANG_CHUYEN && r.fromBranchId === currentBranchId;
```

Tên chi nhánh: resolve inline vào từng dòng từ `useBranches()` (không trả map `{[id]: branch}` ở gốc). Tên tài khoản tiền gửi đích: `useDepositDashboard()` — cùng nguồn dialog đang dùng, tránh thêm endpoint.

## Testing Strategy

Không test tự động (web app không có test runner thật). Phủ bằng click-through ở [TKT-CTF-08](./TKT-CTF-08-tests.md) bước 5-8.

## Dependencies

- Depends on: [TKT-CTF-05](./TKT-CTF-05-openapi-fe-types-hooks.md)
- Blocks: [TKT-CTF-08](./TKT-CTF-08-tests.md)

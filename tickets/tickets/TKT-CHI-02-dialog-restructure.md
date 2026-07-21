# TKT-CHI-02 DepositPaymentVoucherDialog — UI 2 cấp + nhúng 2 sub-mode

## Epic

[EPIC-19072026 Phiếu chi tiền gửi — Hợp nhất theo Mục đích chi (MISA parity)](../epics/EPIC-19072026-deposit-payment-purpose-unification.md)

## Summary

**Đổi widget**: cả "Mục đích chi" và "Hình thức chi" chuyển từ `RadioGroup` (nút radio nằm ngang, đang dùng) sang `SingleSelect` (dropdown có mũi tên) — khớp đúng ảnh MISA (đã chốt với user, chấp nhận đổi luôn cách hiển thị 6 giá trị cũ).

Thêm dropdown cấp 1 "Mục đích chi" (Khác/Trả nợ, `DepositPaymentPurposeRadio` từ CHI-01) phía trên dropdown "Hình thức chi" hiện có. Khi Trả nợ: ẩn hẳn "Hình thức chi", giữ nguyên plumbing `isSupplierPayment` đã có. Khi Khác: hiện "Hình thức chi" với **đúng 3 giá trị** — Chi khác/Chuyển tiền gửi thành tiền mặt/Chuyển tiền gửi đến cửa hàng khác (dùng thẳng `BankPaymentPurpose.OTHER`/`CASH_TRANSFER`/`INTER_BRANCH_OUT`, bỏ `disabled` của `INTER_BRANCH_OUT`).

**Đã đổi hướng so với bản đầu**: ban đầu định giữ cả Mua hàng/Chi phí/Hoàn tiền/Phí ngân hàng trong "Hình thức chi" (7 giá trị) để không mất chức năng — nhưng sau khi thấy UI thật, user xác nhận muốn đúng 3 giá trị như ảnh, chấp nhận bỏ hẳn 4 giá trị đó khỏi luồng tạo/sửa phiếu (đã xác nhận `erp_dev` không có `bank_payments` nào đang dùng 4 purpose đó). Vẫn giữ 1 lớp phòng vệ hiển thị: nếu một phiếu cũ (tạo trực tiếp qua API, ngoài luồng UI) có `purpose` là 1 trong 4 giá trị đã bỏ, dropdown khi View/Edit vẫn hiện đúng nhãn (không trống) nhờ `LEGACY_PURPOSE_LABELS` + `purposeSelectOptions` — không làm 4 giá trị đó chọn lại được, chỉ tránh hiển thị sai.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/deposit-payment-voucher-dialog/DepositPaymentVoucherDialog.tsx` — sửa như Tech Approach.

## Acceptance Criteria

### Cấu trúc chọn mục đích

- [ ] Mặc định mở dialog: Mục đích chi = Khác, Hình thức chi = Khác (`BankPaymentPurpose.OTHER`) — hành vi y hệt hiện tại.
- [ ] Chọn "Trả nợ" ở radio cấp 1 → ẩn hẳn radio "Hình thức chi" (khớp ảnh #18: không có dropdown thứ 2 khi Trả nợ), chuyển đúng nhánh `isSupplierPayment` hiện có (nút "Chọn hóa đơn trả nợ" hiện, field thường khoá) — hành vi bên trong không đổi.
- [ ] Chọn "Khác" → hiện lại "Hình thức chi" với **đúng 3 giá trị**: OTHER ("Chi khác"), CASH_TRANSFER ("Chuyển tiền gửi thành tiền mặt"), INTER_BRANCH_OUT ("Chuyển tiền gửi đến cửa hàng khác"). `SUPPLIER_PAYMENT`, `PURCHASE`, `EXPENSE`, `REFUND`, `BANK_FEE` không còn chọn được trong luồng tạo/sửa.
- [ ] Một phiếu đã lưu (View/Edit) có `purpose` là 1 trong 4 giá trị đã bỏ vẫn hiện đúng nhãn trong dropdown (không trống) nhờ `purposeSelectOptions` phụ thêm giá trị hiện tại — không làm giá trị đó chọn lại được cho phiếu mới.
- [ ] Đổi nhãn: `CASH_TRANSFER` → **"Chuyển tiền gửi thành tiền mặt"** (cũ: "Chuyển thành tiền mặt"); `INTER_BRANCH_OUT` → **"Chuyển tiền gửi đến cửa hàng khác"** (cũ: "Chuyển tiền đến chi nhánh khác (GĐ4)"), **bỏ `disabled: true`**.
- [ ] Chọn OTHER/PURCHASE/EXPENSE/REFUND/BANK_FEE → **không đổi gì** so với trước ticket (form, validate, dispatch `kind:"voucher"` y hệt).
- [ ] Đổi từ "Trả nợ" sang "Khác" (và ngược lại) reset sạch state của nhánh kia (không rò rỉ `documentLines`/dòng chi tiết auto-fill).

### Chọn "Chuyển tiền gửi thành tiền mặt" (`purpose === CASH_TRANSFER`)

- [ ] Lý do chi tự động điền `"Rút tiền gửi về nhập quỹ tiền mặt"` (sửa được, không readonly — khớp ảnh #20).
- [ ] Dòng CHI TIẾT tự động đúng 1 dòng: Diễn giải = Lý do chi hiện tại, Mục chi = `"Rút tiền gửi về nhập quỹ"`, Số tiền = 0 (nhập tay). Khoá thêm/xoá dòng (cùng cơ chế đã dùng cho `isSupplierPayment`).
- [ ] Checkbox "Tự động sinh phiếu thu tiền ngay sau khi chi": luôn tick, disabled (quyết định: BE luôn tự sinh trong 1 transaction, không phải toggle thật).
- [ ] "Tính vào chi phí" tắt/ẩn — tái dùng đúng `isFundMove`/BR-CHI-05 đã có (mở rộng điều kiện cho đủ 2 purpose y như hiện tại, không đổi cơ chế).
- [ ] Field Đối tượng nhận/Người nhận/Địa chỉ/Nhân viên chi **không khoá** (khác nhánh Trả nợ — khớp ảnh #20).
- [ ] Lưu: validate `depositAccountId`/`docDate` như cũ + dòng CHI TIẾT phải có amount > 0. Dispatch:
  ```ts
  onSave({
    kind: "fundSwap",
    body: {
      direction: FundSwapDirection.DEPOSIT_TO_CASH,
      depositAccountId,
      amount: lineTotal,
      docDate,
      reason: reason || undefined,
    },
  });
  ```
- [ ] Không có field "Phí rút tiền" (ngoài phạm vi epic).

### Chọn "Chuyển tiền gửi đến cửa hàng khác" (`purpose === INTER_BRANCH_OUT`)

- [ ] Thêm select bắt buộc **"Cửa hàng nhận \*"** (`useBranches()`, lọc bỏ chi nhánh hiện tại — tái dùng logic `branchOptions` của `DepositTransferCreateDialog.tsx:52-55`).
- [ ] Thêm select **"Tài khoản nhận"** phụ thuộc "Cửa hàng nhận" (`useDepositDashboard()`, tái dùng logic `toBranchAccounts`/`accountOptions`/`showAccountGap` của `DepositTransferCreateDialog.tsx:57-67, 137-142`, kể cả cảnh báo thiếu quyền xem quỹ chi nhánh đích).
- [ ] Lý do chi tự động điền `"Chi chuyển tiền sang cửa hàng"`; dòng CHI TIẾT tự động 1 dòng, Mục chi = `"Chi chuyển tiền sang cửa hàng khác"` — cùng cơ chế khoá grid.
- [ ] Checkbox "Tự động sinh phiếu thu tiền ngay sau khi chi": tick, disabled, kèm caption ngắn (vd: "Chi nhánh đích tự xác nhận nhận tiền sau") — **không** có dropdown con "Thu tiền gửi" (đơn giản hoá so với ảnh #21, đã chốt với user).
- [ ] Lưu: validate thêm `toBranchId`/`toAccountId` bắt buộc + dòng CHI TIẾT amount > 0. Dispatch:
  ```ts
  onSave({
    kind: "depositTransfer",
    body: { toBranchId, toAccountId, amount: lineTotal, note: reason || undefined },
  });
  ```

### Chung

- [ ] `DepositPaymentSaveResult` mở rộng union:
  ```ts
  export type DepositPaymentSaveResult =
    | { kind: "voucher"; body: CreateBankPaymentBody }
    | { kind: "supplierDepositPayment"; body: CreateSupplierDepositPaymentBody }
    | { kind: "fundSwap"; body: CreateFundSwapBody }
    | { kind: "depositTransfer"; body: CreateDepositTransferBody };
  ```
- [ ] Chỉ áp dụng UI 2 cấp cho luồng TẠO MỚI. Mở lại phiếu đã lưu (VIEW/EDIT) luôn hiện dạng phẳng như hiện tại — không suy ngược sub-mode gốc (không đủ dữ liệu, không nằm trong yêu cầu).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] "Chi khác" (OTHER) + nhánh Trả nợ chạy y hệt trước ticket — không hồi quy.
- [ ] Named export, không default export; không tạo `index.ts` mới.

## Tech Approach

Thêm state mới:

```ts
const [purposeGroup, setPurposeGroup] = useState<DepositPaymentPurposeRadio>(
  DepositPaymentPurposeRadio.OTHER_GROUP,
);
const [toBranchId, setToBranchId] = useState("");
const [toAccountId, setToAccountId] = useState("");
```

`PAYMENT_PURPOSE_OPTIONS` (dòng 74-87): bỏ dòng `SUPPLIER_PAYMENT`, đổi nhãn `CASH_TRANSFER`/`INTER_BRANCH_OUT`, bỏ `disabled: true`.

`isSupplierPayment` đổi định nghĩa từ `purpose === BankPaymentPurpose.SUPPLIER_PAYMENT` sang `purposeGroup === DepositPaymentPurposeRadio.DEBT_GROUP` (giữ tên biến — mọi chỗ dùng `isSupplierPayment` trong file không cần sửa thêm). Khi `handlePurposeChange` (hoặc effect riêng cho `purposeGroup`) chuyển sang Trả nợ, set `purpose = BankPaymentPurpose.SUPPLIER_PAYMENT` nội bộ (giữ tương thích với nhánh `handleSave` hiện có đang check `isSupplierPayment`, không cần sửa nhánh đó).

`isFundMove` giữ nguyên định nghĩa hiện tại (`purpose === CASH_TRANSFER || purpose === INTER_BRANCH_OUT`) — đã đúng, không cần đổi.

Effect auto-fill (song song `handleDebtRepaymentConfirm` đã có):

```ts
useEffect(() => {
  if (purpose === BankPaymentPurpose.CASH_TRANSFER) {
    setReason("Rút tiền gửi về nhập quỹ tiền mặt");
    setLines([{ description: "Rút tiền gửi về nhập quỹ tiền mặt", amount: 0, category: "Rút tiền gửi về nhập quỹ", categoryId: undefined }]);
  } else if (purpose === BankPaymentPurpose.INTER_BRANCH_OUT) {
    setReason("Chi chuyển tiền sang cửa hàng");
    setLines([{ description: "Chi chuyển tiền sang cửa hàng", amount: 0, category: "Chi chuyển tiền sang cửa hàng khác", categoryId: undefined }]);
  }
}, [purpose]);
```

`handleSave` thêm 2 nhánh **trước** nhánh `isSupplierPayment` hiện có (thứ tự: Trả nợ → CASH_TRANSFER(fundSwap) → INTER_BRANCH_OUT(depositTransfer) → voucher mặc định), tái dùng `lineTotal` (dòng 349) làm `amount`. Grid khoá thêm/xoá dòng: mở rộng điều kiện hiện có `isSupplierPayment` (dòng 732, 751, 754, 759-760) thành `isSupplierPayment || isFundMove`.

Import thêm: `useBranches` (`../../../../hooks/iam/useBranches`), `useBranchStore` (`../../../../store/common/branch/branch.store`), `useDepositDashboard` (`../../../../hooks/treasury/use-deposit-dashboard`), `SingleSelect`/`type SingleSelectOption` (`@erp/ui`), `FundSwapDirection`/`type CreateFundSwapBody` (`../../bank-vouchers.types`), `type CreateDepositTransferBody` (`../../deposit-transfer/deposit-transfer.types` — khác thư mục với các type khác, đã xác nhận qua `use-deposit-transfers.ts:10`).

Field "Cửa hàng nhận"/"Tài khoản nhận" đặt trong `documentInfo` slot (cột phải, cạnh "Tài khoản chi") khi `purpose === INTER_BRANCH_OUT`, theo bố cục ảnh #21.

## Testing Strategy

Không có test tự động cho `backoffice-web` — verify bằng `pnpm build` + thao tác tay (CHI-05).

## Dependencies

- Depends on: [TKT-CHI-01](./TKT-CHI-01-purpose-constants.md)
- Blocks: [TKT-CHI-03](./TKT-CHI-03-page-wiring.md), [TKT-CHI-04](./TKT-CHI-04-debt-mode-polish.md)

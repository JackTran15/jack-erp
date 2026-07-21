# TKT-CHI-03 TreasuryDepositReceiptsPage — điều hướng kết quả lưu

## Epic

[EPIC-19072026 Phiếu chi tiền gửi — Hợp nhất theo Mục đích chi (MISA parity)](../epics/EPIC-19072026-deposit-payment-purpose-unification.md)

## Summary

`handleSavePayment` (`TreasuryDepositReceiptsPage.tsx:364-386`) hiện chỉ xử lý 2 kind (`supplierDepositPayment`, mặc định coi mọi thứ khác là `voucher`). Thêm nhánh cho 2 kind mới từ CHI-02 (`fundSwap`, `depositTransfer`), gọi đúng mutation hook có sẵn.

**Bắt buộc merge cùng CHI-02** — thiếu ticket này, 2 sub-mode mới trong dialog compile được nhưng bấm Lưu không làm gì (rơi vào nhánh `else` cũ, gọi nhầm `paymentMutations.create` với body sai shape).

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit/receipts-expenses/TreasuryDepositReceiptsPage.tsx` — sửa `handleSavePayment`, thêm import 2 hook mutation.

## Acceptance Criteria

- [ ] `result.kind === "fundSwap"` → gọi `useFundSwapMutation().mutateAsync(result.body)`; thành công thì đóng dialog (không cần `setSelectedId` — `FundSwapDialog` gốc cũng không set), lỗi thì toast đúng message từ server (không nuốt lỗi).
- [ ] `result.kind === "depositTransfer"` → gọi `useCreateDepositTransfer().mutateAsync(result.body)`; thành công đóng dialog + toast **"Đã khởi tạo chuyển tiền — trạng thái Đang chuyển."** (khớp thông báo của `DepositTransferCreateDialog` gốc, để không gây khác biệt hành vi giữa 2 đường vào cùng 1 tính năng).
- [ ] Sau khi `fundSwap`/`depositTransfer` thành công, danh sách Thu-chi (`receiptsList`/`paymentsList`) phải refetch nếu dữ liệu ảnh hưởng tới nó — kiểm tra: `fundSwap` tạo ra 1 `bank_payment` thật (nên CÓ xuất hiện trong danh sách Phiếu chi tiền gửi ngay sau khi lưu); dùng cùng cơ chế invalidate mà `useFundSwapMutation`/`useCreateDepositTransfer` tự làm (kiểm tra 2 hook này đã tự `invalidateQueries` đúng key `bank-payments`/`deposit-ledger` chưa — nếu thiếu, bổ sung ở đây bằng cách gọi `receiptsList.refetch()`/`paymentsList.refetch()` sau khi thành công, giống `handleReload` hiện có).
- [ ] Không đổi hành vi nhánh `supplierDepositPayment` hoặc nhánh mặc định (`voucher`) hiện có.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Thao tác tay: tạo 1 phiếu qua mỗi sub-mode mới, xác nhận nó xuất hiện đúng trong danh sách Thu-chi ngay sau khi lưu (không cần F5 thủ công).

## Tech Approach

```ts
const fundSwap = useFundSwapMutation();
const createDepositTransfer = useCreateDepositTransfer();

const handleSavePayment = useCallback(
  async (result: DepositPaymentSaveResult) => {
    try {
      if (result.kind === "supplierDepositPayment") {
        const saga = await supplierDepositPayment.mutateAsync(result.body);
        if (saga.bankPaymentId) setSelectedId(saga.bankPaymentId);
      } else if (result.kind === "fundSwap") {
        await fundSwap.mutateAsync(result.body);
        void receiptsList.refetch();
        void paymentsList.refetch();
      } else if (result.kind === "depositTransfer") {
        await createDepositTransfer.mutateAsync(result.body);
        void receiptsList.refetch();
        void paymentsList.refetch();
      } else {
        const body: CreateBankPaymentBody = result.body;
        if (voucherDialog?.mode === TreasuryVoucherDialogModeEnum.CREATE) {
          const created = await paymentMutations.create.mutateAsync(body);
          setSelectedId(created.id);
        } else if (selectedId) {
          const { documentNumber: _doc, ...updateBody } = body;
          await paymentMutations.update.mutateAsync({ id: selectedId, body: updateBody });
        }
      }
      closeVoucherDialogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu phiếu chi thất bại.");
    }
  },
  [
    voucherDialog, selectedId, paymentMutations, supplierDepositPayment,
    fundSwap, createDepositTransfer, receiptsList, paymentsList, closeVoucherDialogs,
  ],
);
```

Trước khi thêm `refetch()` thủ công, đọc `use-fund-swap.ts`/`use-deposit-transfers.ts` xem `useMutation` đã có `onSuccess: () => queryClient.invalidateQueries(...)` chưa — nếu đã invalidate đúng `bank-payments`/`bank-receipts` key rồi thì bỏ dòng refetch thừa (tránh double-fetch); AC ở trên chỉ yêu cầu **kết quả** (list cập nhật ngay), không bắt buộc cách làm.

## Dependencies

- Depends on: [TKT-CHI-02](./TKT-CHI-02-dialog-restructure.md)
- Blocks: [TKT-CHI-05](./TKT-CHI-05-manual-test-plan.md)

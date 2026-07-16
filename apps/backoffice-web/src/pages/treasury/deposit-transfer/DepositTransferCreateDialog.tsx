import { useEffect, useMemo, useState } from "react";
import { AppModal, Button, FormField, Input, MoneyInput, SingleSelect, type SingleSelectOption } from "@erp/ui";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useBranches } from "../../../hooks/iam/useBranches";
import { useBranchStore } from "../../../store/common/branch/branch.store";
import { useCreateDepositTransfer } from "../../../hooks/treasury/use-deposit-transfers";
import { useDepositDashboard } from "../../../hooks/treasury/use-deposit-dashboard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Khởi tạo tại CN A (chi nhánh đang chọn) → chuyển tới CN đích. Nguồn (chi
 * nhánh + tài khoản) luôn là chi nhánh đang hoạt động, resolve server-side —
 * form chỉ chọn đích.
 *
 * Known gap: không có endpoint liệt kê tài khoản tiền gửi của MỘT chi nhánh
 * bất kỳ (generic CRUD `/admin/entities/deposit-accounts/records` khóa cứng
 * theo chi nhánh đang hoạt động — xem `deposit-accounts.crud.ts`). Picker
 * "Tài khoản đích" tái dùng `GET /deposit/dashboard` (đã trả accounts theo
 * từng chi nhánh actor được gán) làm nguồn dữ liệu; nếu chi nhánh đích không
 * nằm trong danh sách chi nhánh được gán của actor, danh sách tài khoản sẽ
 * rỗng — hiển thị cảnh báo thay vì chặn hoàn toàn.
 */
export function DepositTransferCreateDialog({ open, onOpenChange }: Props) {
  const branchId = useBranchStore((s) => s.branchId);
  const branchName = useBranchStore((s) => s.branchName);
  const { data: branches = [] } = useBranches();
  const { data: dashboard } = useDepositDashboard();
  const create = useCreateDepositTransfer();

  const [toBranchId, setToBranchId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setToBranchId("");
    setToAccountId("");
    setAmount(0);
    setNote("");
  }, [open]);

  useEffect(() => {
    setToAccountId("");
  }, [toBranchId]);

  const branchOptions = useMemo<SingleSelectOption[]>(
    () => branches.filter((b) => b.id !== branchId).map((b) => ({ value: b.id, label: b.name })),
    [branches, branchId],
  );

  const toBranchAccounts = useMemo(
    () => dashboard?.branches.find((b) => b.branchId === toBranchId)?.accounts ?? [],
    [dashboard, toBranchId],
  );

  const accountOptions = useMemo<SingleSelectOption[]>(
    () => toBranchAccounts.map((a) => ({ value: a.accountId, label: a.name })),
    [toBranchAccounts],
  );

  const showAccountGap = Boolean(toBranchId) && accountOptions.length === 0;

  const handleConfirm = async () => {
    if (!toBranchId) {
      toast.error("Vui lòng chọn chi nhánh đích.");
      return;
    }
    if (!toAccountId) {
      toast.error("Vui lòng chọn tài khoản đích.");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Số tiền chuyển phải lớn hơn 0.");
      return;
    }
    try {
      await create.mutateAsync({ toBranchId, toAccountId, amount, note: note.trim() || undefined });
      toast.success("Đã khởi tạo chuyển tiền — trạng thái Đang chuyển.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chuyển tiền thất bại.");
    }
  };

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Chuyển tiền liên chi nhánh"
      bodyStretch={false}
      defaultWidth={520}
      defaultHeight={440}
      minWidth={420}
      minHeight={400}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
          <Button type="button" disabled={create.isPending} onClick={() => void handleConfirm()}>
            <Check className="mr-1 h-4 w-4" />
            {create.isPending ? "Đang xử lý…" : "Chuyển tiền"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label="Chi nhánh nguồn" layout="horizontal" labelWidth="8rem">
          <Input value={branchName ?? ""} readOnly disabled className="bg-muted/30" />
        </FormField>
        <FormField label="Chi nhánh đích" required layout="horizontal" labelWidth="8rem">
          <SingleSelect
            options={branchOptions}
            value={toBranchId}
            onValueChange={setToBranchId}
            placeholder="Chọn chi nhánh đích"
          />
        </FormField>
        <FormField label="Tài khoản đích" required layout="horizontal" labelWidth="8rem">
          <SingleSelect
            options={accountOptions}
            value={toAccountId}
            onValueChange={setToAccountId}
            placeholder={toBranchId ? "Chọn tài khoản" : "Chọn chi nhánh đích trước"}
            disabled={!toBranchId}
          />
        </FormField>
        {showAccountGap ? (
          <p className="text-xs text-amber-600">
            Không thấy tài khoản tiền gửi nào của chi nhánh này — bạn có thể không được gán quyền
            xem quỹ chi nhánh đích. Liên hệ quản trị nếu cần chuyển tới chi nhánh này.
          </p>
        ) : null}
        <FormField label="Số tiền" required layout="horizontal" labelWidth="8rem">
          <MoneyInput value={amount} onChange={(v) => setAmount(v === "" ? 0 : Number(v))} />
        </FormField>
        <FormField label="Ghi chú" layout="horizontal" labelWidth="8rem">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
        </FormField>
      </div>
    </AppModal>
  );
}

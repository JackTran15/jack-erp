import { useEffect, useState } from "react";
import { AppModal, Button, FormField, Input, MoneyInput } from "@erp/ui";
import type { UserDetail } from "@erp/shared-interfaces";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useCreateUser, getIamErrorMessage } from "../../hooks/iam";
import type { EmployeeFormDraft } from "../../pages/employees/employee.types";
import { EmployeeFormModal } from "../../pages/employees/components/EmployeeFormModal";
import type { EmployeeFormSaveContext } from "../../pages/employees/components/EmployeeFormModal";
import { CrudRecordDialog } from "../crud/CrudRecordDialog";

interface BaseQuickDialogProps<T> {
  open: boolean;
  onClose: () => void;
  onCreated: (record: T) => void;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface QuickProvider {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export function QuickCreateProviderDialog({
  open,
  onClose,
  onCreated,
}: BaseQuickDialogProps<QuickProvider>) {
  return (
    <CrudRecordDialog
      entityKey="inventory-providers"
      recordId={null}
      open={open}
      onClose={onClose}
      onSuccess={(record) => {
        onCreated({
          id: String(record.id ?? ""),
          code: String(record.code ?? ""),
          name: String(record.name ?? ""),
          phone: record.phone != null ? String(record.phone) : undefined,
          email: record.email != null ? String(record.email) : undefined,
        });
      }}
    />
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

export interface QuickItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice?: number;
  purchasePrice?: number;
}

export function QuickCreateItemDialog({
  open,
  onClose,
  onCreated,
}: BaseQuickDialogProps<QuickItem>) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Cái");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [purchasePrice, setPurchasePrice] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCode("");
    setName("");
    setUnit("Cái");
    setSellingPrice("");
    setPurchasePrice("");
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || !unit.trim()) {
      toast.error("Vui lòng nhập mã, tên và đơn vị tính.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.post<QuickItem>("/inventory/items", {
        code: code.trim(),
        name: name.trim(),
        unit: unit.trim(),
        sellingPrice: sellingPrice === "" ? 0 : sellingPrice,
        purchasePrice: purchasePrice === "" ? 0 : purchasePrice,
        isActive: true,
        isPosVisible: true,
      });
      toast.success(`Đã tạo SKU "${data.code}".`);
      onCreated(data);
      reset();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Thêm nhanh hàng hóa"
      onSave={() => void handleSave()}
      onCancel={onClose}
      saveLabel={saving ? "Đang lưu…" : "Lưu"}
      saveDisabled={saving}
      className="max-w-[520px]"
    >
      <div className="flex flex-col gap-3">
        <FormField label="Mã SKU *">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Tên hàng hóa *">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Đơn vị tính *">
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Cái, Đôi, Hộp…"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Giá bán">
            <MoneyInput value={sellingPrice} onChange={setSellingPrice} />
          </FormField>
          <FormField label="Giá nhập">
            <MoneyInput value={purchasePrice} onChange={setPurchasePrice} />
          </FormField>
        </div>
      </div>
    </AppModal>
  );
}

// ─── Issue Reason ─────────────────────────────────────────────────────────────

export type IssueReasonPurpose = "OTHER" | "DISPOSAL";

export interface QuickIssueReason {
  id: string;
  code: string;
  name: string;
  purpose: IssueReasonPurpose;
}

interface QuickCreateIssueReasonDialogProps
  extends BaseQuickDialogProps<QuickIssueReason> {
  /** Which reason bucket to create in. Determines API filter. */
  purpose: IssueReasonPurpose;
}

const ISSUE_REASON_LABELS: Record<IssueReasonPurpose, string> = {
  OTHER: "Thêm mới lý do (Khác)",
  DISPOSAL: "Thêm mới lý do hủy hàng",
};

export function QuickCreateIssueReasonDialog({
  open,
  onClose,
  onCreated,
  purpose,
}: QuickCreateIssueReasonDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Vui lòng nhập lý do.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.post<QuickIssueReason>(
        "/inventory/issue-reasons",
        { name: trimmed, purpose, isActive: true },
      );
      toast.success(`Đã thêm lý do "${data.name}".`);
      onCreated(data);
      reset();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={ISSUE_REASON_LABELS[purpose]}
      footer={
        <div className="flex min-h-[72px] w-full items-center justify-end gap-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              className="gap-2"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              <Save className="h-4 w-4" />
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="gap-2 font-semibold text-primary-blue hover:bg-primary-blue/10 hover:text-primary-blue-hover"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
      defaultWidth={760}
      defaultHeight={280}
      minWidth={680}
      minHeight={260}
      bodyStretch={false}
      bodyClassName="overflow-visible px-1"
    >
      <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4 pb-4 pt-2">
        <label htmlFor="quick-issue-reason-name" className="text-base font-normal">
          Lý do <span className="text-destructive">*</span>
        </label>
        <div className="min-w-0 px-0.5">
          <Input
            id="quick-issue-reason-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="VD: Hàng hỏng do bảo quản chưa tốt"
            className="h-11"
          />
        </div>
      </div>
    </AppModal>
  );
}

// ─── Location ────────────────────────────────────────────────────────────────

export interface QuickLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  branchId: string;
  type: string;
}

interface QuickCreateLocationDialogProps extends BaseQuickDialogProps<QuickLocation> {
  /** Storage options for the dropdown. Caller passes the same list it uses elsewhere. */
  storages: Array<{ id: string; name: string; branchId: string }>;
}

export function QuickCreateLocationDialog({
  open,
  onClose,
  onCreated,
  storages,
}: QuickCreateLocationDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [storageId, setStorageId] = useState(storages[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  // `storages` loads asynchronously, so the initial useState above captures an
  // empty list. Keep `storageId` pointing at a valid storage once the list
  // arrives (or when the current selection is no longer in the list), otherwise
  // the <select> visually shows the first option while state stays "".
  useEffect(() => {
    if (storages.length === 0) return;
    setStorageId((prev) =>
      prev && storages.some((s) => s.id === prev) ? prev : storages[0].id,
    );
  }, [storages]);

  const reset = () => {
    setCode("");
    setName("");
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || !storageId) {
      toast.error("Vui lòng điền mã, tên và chọn kho.");
      return;
    }
    const branchId = storages.find((s) => s.id === storageId)?.branchId;
    if (!branchId) {
      toast.error("Không xác định được chi nhánh của kho đã chọn.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.post<QuickLocation>("/inventory/locations", {
        code: code.trim(),
        name: name.trim(),
        storageId,
        branchId,
        type: "SHELF",
      });
      toast.success(`Đã tạo vị trí "${data.code}".`);
      onCreated(data);
      reset();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Thêm nhanh kho/vị trí"
      onSave={() => void handleSave()}
      onCancel={onClose}
      saveLabel={saving ? "Đang lưu…" : "Lưu"}
      saveDisabled={saving}
      className="max-w-[480px]"
    >
      <div className="flex flex-col gap-3">
        <FormField label="Mã vị trí *">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Tên vị trí *">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Thuộc kho *">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
          >
            {storages.length === 0 ? <option value="">Chưa có kho</option> : null}
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>
    </AppModal>
  );
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface QuickCustomer {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

export function QuickCreateCustomerDialog({
  open,
  onClose,
  onCreated,
}: BaseQuickDialogProps<QuickCustomer>) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCode("");
    setName("");
    setPhone("");
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên khách hàng.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.post<QuickCustomer>("/customers", {
        code: code.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      toast.success(`Đã tạo khách hàng "${data.name}".`);
      onCreated(data);
      reset();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Thêm nhanh khách hàng"
      onSave={() => void handleSave()}
      onCancel={onClose}
      saveLabel={saving ? "Đang lưu…" : "Lưu"}
      saveDisabled={saving}
      className="max-w-[480px]"
    >
      <div className="flex flex-col gap-3">
        <FormField label="Mã khách hàng *">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Tên khách hàng *">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Điện thoại">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
      </div>
    </AppModal>
  );
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface QuickEmployee {
  id: string;
  code: string;
  name: string;
}

function userDetailToQuickEmployee(user: UserDetail): QuickEmployee {
  return {
    id: user.id,
    code: user.code ?? user.profile?.code ?? "",
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
  };
}

export function QuickCreateEmployeeDialog({
  open,
  onClose,
  onCreated,
}: BaseQuickDialogProps<QuickEmployee>) {
  const createUser = useCreateUser();

  const handleSave = async (draft: EmployeeFormDraft, _context: EmployeeFormSaveContext) => {
    try {
      const created = await createUser.mutateAsync(draft);
      toast.success("Đã thêm nhân viên mới.");
      onCreated(userDetailToQuickEmployee(created));
      onClose();
    } catch (err) {
      toast.error(getIamErrorMessage(err, "Không lưu được nhân viên."));
    }
  };

  return (
    <EmployeeFormModal
      open={open}
      mode="create"
      onClose={onClose}
      onSave={(draft, context) => void handleSave(draft, context)}
    />
  );
}

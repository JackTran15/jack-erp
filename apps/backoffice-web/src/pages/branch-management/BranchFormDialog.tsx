import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@erp/ui";
import { toast } from "sonner";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { usePermissionCheck } from "../../hooks/usePermissionCheck";
import {
  fetchBranchDeactivationImpact,
  type BranchDeactivationImpact,
} from "../../hooks/iam/useBranchDeactivationImpact";
import type { BranchRow } from "./branch-rows";

interface Props {
  open: boolean;
  /** null = create. */
  branch: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
}

const EMPTY: FormValues = { name: "", code: "", address: "", phone: "", email: "" };

/**
 * Purpose-built rather than the generic CrudRecordDialog (ADR-08): the store
 * lifecycle needs a checkbox that is not a normal field, a confirmation that
 * fetches live counts, and a permission gate — three things that would each
 * have become another `entityKey === "branches"` branch in shared code.
 */
export function BranchFormDialog({ open, branch, onClose, onSaved }: Props) {
  const isEdit = Boolean(branch);
  const { has } = usePermissionCheck();
  const canArchive = has("branch.archive");

  const [values, setValues] = useState<FormValues>(EMPTY);
  const [inactive, setInactive] = useState(false);
  const [wasInactive, setWasInactive] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [impact, setImpact] = useState<BranchDeactivationImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (branch) {
      setValues({
        name: branch.name ?? "",
        code: branch.code ?? "",
        address: branch.address ?? "",
        phone: branch.phone ?? "",
        email: branch.email ?? "",
      });
      const suspended = branch.status === "SUSPENDED";
      setInactive(suspended);
      setWasInactive(suspended);
    } else {
      setValues(EMPTY);
      setInactive(false);
      setWasInactive(false);
    }
    setErrors({});
    setConfirmOpen(false);
    setImpact(null);
  }, [open, branch]);

  const set = (key: keyof FormValues) => (v: string) => {
    setValues((p) => ({ ...p, [key]: v }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormValues, string>> = {};
    if (!values.name.trim()) next.name = "Tên cửa hàng là bắt buộc";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    setSaving(true);
    try {
      // Blank text means "no value"; these columns are nullable, so send null
      // rather than "" — @IsOptional() skips null but not the empty string.
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        code: values.code.trim() || null,
        address: values.address.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
      };
      // Only when the tick actually moved: an unchanged status is a no-op the
      // backend still charges branch.archive for if it differs, and an ARCHIVED
      // branch would be pushed to ACTIVE by an unconditional send.
      if (isEdit && inactive !== wasInactive) {
        body.status = inactive ? "SUSPENDED" : "ACTIVE";
      }

      if (isEdit && branch) {
        requireErpData(await erpApi.PATCH(`/branches/${branch.id}`, { body }));
      } else {
        requireErpData(await erpApi.POST("/branches", { body }));
      }
      toast.success(isEdit ? "Đã cập nhật cửa hàng." : "Đã tạo cửa hàng.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const requestSave = async () => {
    if (!validate()) return;
    if (isEdit && inactive && !wasInactive && branch) {
      setConfirmOpen(true);
      setImpactLoading(true);
      setImpact(null);
      try {
        setImpact(await fetchBranchDeactivationImpact(branch.id));
      } catch {
        // A failed count must not block the decision — ask anyway, without numbers.
        setImpact(null);
      } finally {
        setImpactLoading(false);
      }
      return;
    }
    await save();
  };

  const field = (
    key: keyof FormValues,
    label: string,
    opts?: { required?: boolean; type?: string },
  ) => (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <label htmlFor={`branch-${key}`} className="pt-2 text-sm font-medium">
        {label} {opts?.required && <span className="text-destructive">*</span>}
      </label>
      <div>
        <Input
          id={`branch-${key}`}
          type={opts?.type ?? "text"}
          value={values[key]}
          onChange={(e) => set(key)(e.target.value)}
        />
        {errors[key] && (
          <p className="mt-1 text-xs text-destructive">{errors[key]}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Sửa cửa hàng" : "Thêm mới cửa hàng"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {field("name", "Tên cửa hàng", { required: true })}
            {field("code", "Mã cửa hàng")}
            {field("address", "Địa chỉ")}
            {field("phone", "Số điện thoại")}
            {field("email", "Email", { type: "email" })}

            {/* Ngừng hoạt động: chỉ khi SỬA, không phải cửa hàng chính, và chỉ
                cho người có branch.archive — endpoint đằng sau đòi quyền đó, nên
                hiện ô tích cho người khác là mời họ vào một cái 403. */}
            {isEdit && !branch?.isMainBranch && canArchive && (
              <label className="flex items-center gap-2 pl-[132px] text-sm">
                <input
                  id="branch-inactive"
                  type="checkbox"
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary"
                  checked={inactive}
                  onChange={(e) => setInactive(e.target.checked)}
                />
                <span className="cursor-pointer select-none font-medium">
                  Ngừng hoạt động
                </span>
              </label>
            )}
            {isEdit && branch?.isMainBranch && (
              <p className="pl-[132px] text-xs text-muted-foreground">
                Đây là cửa hàng chính của tổ chức nên không thể ngừng hoạt động.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="!bg-primary-blue !text-primary-blue-foreground hover:!bg-primary-blue-hover"
              disabled={saving}
              onClick={() => void requestSave()}
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
            <Button variant="outline" type="button" disabled={saving} onClick={onClose}>
              Hủy bỏ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => { if (!o && !saving) setConfirmOpen(false); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ngừng hoạt động cửa hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <p>
              Nếu ngừng hoạt động cửa hàng{" "}
              <span className="font-semibold">{values.name}</span> các thiết bị
              bán hàng sẽ không tiếp tục làm việc được nữa. Bạn có chắc chắn
              muốn ngừng hoạt động cửa hàng này không?
            </p>
            {impactLoading && (
              <p className="text-muted-foreground">Đang kiểm tra dữ liệu liên quan…</p>
            )}
            {impact?.warnings.length ? (
              <div className="rounded border border-border bg-muted/40 p-3">
                <p className="mb-1 font-medium">Cửa hàng này vẫn còn:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {impact.warnings.map((w) => (
                    <li key={w.code}>
                      {w.count.toLocaleString("vi-VN")} {w.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="!bg-primary-blue !text-primary-blue-foreground hover:!bg-primary-blue-hover"
              disabled={saving || Boolean(impact?.blockers.length)}
              onClick={() => { setConfirmOpen(false); void save(); }}
            >
              {saving ? "Đang lưu…" : "Có"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              Không
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

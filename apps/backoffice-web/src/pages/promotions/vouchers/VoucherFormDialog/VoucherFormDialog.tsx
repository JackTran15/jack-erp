import { useCallback, useState } from "react";
import { AppModal, Button, FormField, Input, MoneyInput } from "@erp/ui";
import { toast } from "sonner";
import { HttpError } from "../../../../lib/http";
import {
  useCreateVoucher,
  useUpdateVoucher,
  type CreateVoucherRequest,
  type VoucherSummaryRow,
} from "../../api/use-vouchers";

/**
 * Nhân bản cố ý **không** gọi `POST /:id/duplicate`: cùng lý do với CTKM (FR-008)
 * — endpoint đó ghi ngay, còn ở đây bấm nhầm rồi Hủy phải không để lại gì. Dialog
 * chỉ điền sẵn từ dòng nguồn và bỏ trống `code` để người dùng nhập mã mới (A-16:
 * mã nhập tay, không sinh hàng loạt).
 */
export type VoucherFormMode =
  | { kind: "create" }
  | { kind: "edit"; source: VoucherSummaryRow }
  | { kind: "duplicate"; source: VoucherSummaryRow };

interface Props {
  mode: VoucherFormMode;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  startDate: string;
  endDate: string;
  issuer: string;
  code: string;
  faceValue: number | "";
  description: string;
}

function initialState(mode: VoucherFormMode): FormState {
  if (mode.kind === "create") {
    return {
      startDate: "",
      endDate: "",
      issuer: "",
      code: "",
      faceValue: "",
      description: "",
    };
  }
  const { source } = mode;
  return {
    startDate: source.startDate ?? "",
    endDate: source.endDate ?? "",
    issuer: source.issuer ?? "",
    // Nhân bản để trống mã — `uq_voucher_org_code` không cho trùng.
    code: mode.kind === "duplicate" ? "" : source.code,
    faceValue: source.faceValue,
    description: source.description ?? "",
  };
}

const TITLES: Record<VoucherFormMode["kind"], string> = {
  create: "Thêm mới thẻ voucher",
  edit: "Sửa thẻ voucher",
  duplicate: "Nhân bản thẻ voucher",
};

export function VoucherFormDialog({ mode, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(mode));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const createVoucher = useCreateVoucher();
  const updateVoucher = useUpdateVoucher();
  const isSaving = createVoucher.isPending || updateVoucher.isPending;

  const patch = useCallback((next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors({});
  }, []);

  const save = useCallback(async () => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.issuer.trim()) nextErrors.issuer = "Vui lòng nhập nhà phát hành.";
    if (!form.code.trim()) nextErrors.code = "Vui lòng nhập mã voucher.";
    if (form.faceValue === "" || Number(form.faceValue) <= 0) {
      nextErrors.faceValue = "Mệnh giá phải lớn hơn 0.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // Bỏ trống ngày = vô thời hạn (FR-051) → gửi `undefined`, không gửi chuỗi rỗng.
    const body: CreateVoucherRequest = {
      code: form.code.trim(),
      issuer: form.issuer.trim(),
      description: form.description.trim() || undefined,
      faceValue: Number(form.faceValue),
      validFrom: form.startDate || undefined,
      validTo: form.endDate || undefined,
    };

    try {
      if (mode.kind === "edit") {
        await updateVoucher.mutateAsync({ id: mode.source.id, body });
      } else {
        await createVoucher.mutateAsync(body);
      }
      toast.success(
        mode.kind === "edit" ? "Đã lưu thẻ voucher." : "Đã tạo thẻ voucher mới.",
      );
      onSaved();
    } catch (error) {
      // Trùng mã trả 409 — gắn vào **đúng trường** Voucher thay vì toast lỗi máy chủ.
      if (error instanceof HttpError && error.error.status === 409) {
        setErrors({ code: "Mã voucher này đã tồn tại trong tổ chức." });
        return;
      }
      toast.error(
        error instanceof Error ? error.message : "Lưu thẻ voucher thất bại.",
      );
    }
  }, [form, mode, createVoucher, updateVoucher, onSaved]);

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      preventOutsideClose
      title={TITLES[mode.kind]}
      description={null}
      defaultWidth={560}
      defaultHeight={520}
      minWidth={420}
      minHeight={420}
      bodyClassName="flex flex-col gap-3"
      showFooter
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Hủy bỏ
          </Button>
          <Button onClick={() => void save()} disabled={isSaving}>
            {isSaving ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ngày bắt đầu" htmlFor="voucher-start">
          <Input
            id="voucher-start"
            type="date"
            value={form.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </FormField>
        <FormField label="Ngày kết thúc" htmlFor="voucher-end">
          <Input
            id="voucher-end"
            type="date"
            value={form.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
        </FormField>
      </div>
      <p className="-mt-1 text-xs italic text-muted-foreground">
        Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian.
      </p>

      <FormField
        label="Nhà phát hành"
        htmlFor="voucher-issuer"
        required
        error={errors.issuer}
      >
        <Input
          id="voucher-issuer"
          value={form.issuer}
          onChange={(e) => patch({ issuer: e.target.value })}
          aria-invalid={errors.issuer ? true : undefined}
        />
      </FormField>

      <FormField label="Voucher" htmlFor="voucher-code" required error={errors.code}>
        <Input
          id="voucher-code"
          value={form.code}
          onChange={(e) => patch({ code: e.target.value })}
          placeholder="Nhập mã voucher"
          aria-invalid={errors.code ? true : undefined}
        />
      </FormField>

      <FormField
        label="Mệnh giá"
        htmlFor="voucher-face-value"
        required
        error={errors.faceValue}
      >
        <MoneyInput
          id="voucher-face-value"
          value={form.faceValue}
          onChange={(value) => patch({ faceValue: value })}
          aria-invalid={errors.faceValue ? true : undefined}
        />
      </FormField>

      <FormField label="Mô tả" htmlFor="voucher-description">
        <Input
          id="voucher-description"
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </FormField>
    </AppModal>
  );
}

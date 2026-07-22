import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../../../components/layout/AdminPageShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { FormActionBar } from "./FormActionBar/FormActionBar";
import { PromotionInvoiceDiscount } from "./PromotionVariant/PromotionInvoiceDiscount/PromotionInvoiceDiscount";
import { buildInvoiceDiscountPayload } from "./PromotionVariant/PromotionInvoiceDiscount/buildInvoiceDiscountPayload";
import { buildInitialFormState } from "../program-form.constants";
import { PromotionForm, PROMOTION_FORM_LABELS } from "../programs.constants";
import type { ProgramFormState } from "../program-form.types";
import { MOCK_PROGRAM_ROWS } from "../_mock/mock-programs";

/** Dựng state ban đầu, prefill từ mock khi ở chế độ sửa. */
function initialStateFor(id: string | undefined): ProgramFormState {
  const base = buildInitialFormState();
  if (!id) return base;
  const row = MOCK_PROGRAM_ROWS.find((r) => r.id === id);
  if (!row) return base;
  return {
    ...base,
    name: row.name,
    description: row.description ?? "",
    applyTo: row.applyTo,
    startDate: row.startDate ?? "",
    endDate: row.endDate ?? "",
  };
}

export function ProgramFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<ProgramFormState>(() => initialStateFor(id));
  const [formNonce, setFormNonce] = useState(0);

  const onChange = useCallback((patch: Partial<ProgramFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên chương trình.");
      return;
    }
    console.log(
      "[KM] Giảm giá hóa đơn — payload submit:",
      buildInvoiceDiscountPayload(form),
    );
    toast.success(
      isEdit ? "Đã lưu thay đổi chương trình." : "Đã tạo chương trình mới.",
    );
    navigate("/promotions/programs");
  }, [form, isEdit, navigate]);

  const handleSaveAndNew = useCallback(() => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên chương trình.");
      return;
    }
    console.log(
      "[KM] Giảm giá hóa đơn — payload submit:",
      buildInvoiceDiscountPayload(form),
    );
    toast.success("Đã tạo chương trình mới.");
    setForm(buildInitialFormState());
    setFormNonce((n) => n + 1);
  }, [form]);

  const handleCancel = useCallback(() => {
    navigate("/promotions/programs");
  }, [navigate]);

  const typeLabel =
    PROMOTION_FORM_LABELS[PromotionForm.INVOICE_DISCOUNT].toLowerCase();
  const pageTitle = `Chương trình KM/ ${isEdit ? "Sửa" : "Thêm mới"} ${typeLabel}`;

  return (
    <AdminPageShell>
      <PageHeader title={pageTitle} />
      <FormActionBar
        position="top"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
      />

      <PromotionInvoiceDiscount
        key={formNonce}
        form={form}
        onChange={onChange}
      />

      <FormActionBar
        position="bottom"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
      />
    </AdminPageShell>
  );
}

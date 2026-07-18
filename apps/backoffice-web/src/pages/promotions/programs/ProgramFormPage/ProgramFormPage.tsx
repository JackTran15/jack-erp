import { useCallback, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../../../components/layout/AdminPageShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { Tabs } from "../../../../components/tabs/Tabs";
import { useIsChainSelected } from "../../../../store/common/branch/branch.store";
import { FormActionBar } from "./FormActionBar/FormActionBar";
import { GeneralInfoSection } from "./GeneralInfoSection/GeneralInfoSection";
import { TimeSection } from "./TimeSection/TimeSection";
import { StoreScopeSection } from "./StoreScopeSection/StoreScopeSection";
import { ApplyScopeSection } from "./ApplyScopeSection/ApplyScopeSection";
import { DiscountSection } from "./DiscountSection/DiscountSection";
import { GoodsDiscountSection } from "./GoodsDiscountSection/GoodsDiscountSection";
import { TieredDiscountSection } from "./TieredDiscountSection/TieredDiscountSection";
import { GiftSection } from "./GiftSection/GiftSection";
import { ConditionSection } from "./ConditionSection/ConditionSection";
import { ApplicableGoodsTable } from "./ApplicableGoodsTable/ApplicableGoodsTable";
import { AutoApplyCheckbox } from "./AutoApplyCheckbox/AutoApplyCheckbox";
import { buildInitialFormState } from "../program-form.constants";
import type { ProgramFormState } from "../program-form.types";
import { MOCK_PROGRAM_ROWS } from "../_mock/mock-programs";

type FormTab = "km" | "conditions";

const FORM_TABS: { id: FormTab; label: string }[] = [
  { id: "km", label: "Khuyến mại" },
  { id: "conditions", label: "Điều kiện áp dụng" },
];

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
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const isChain = useIsChainSelected();

  const promotionType = isEdit
    ? MOCK_PROGRAM_ROWS.find((r) => r.id === id)?.form ?? "INVOICE_DISCOUNT"
    : searchParams.get("type") ?? "INVOICE_DISCOUNT";

  const [form, setForm] = useState<ProgramFormState>(() => initialStateFor(id));
  const [activeTab, setActiveTab] = useState<FormTab>("km");

  const onChange = useCallback((patch: Partial<ProgramFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên chương trình.");
      return;
    }
    toast.success(
      isEdit ? "Đã lưu thay đổi chương trình." : "Đã tạo chương trình mới.",
    );
    navigate("/promotions/programs");
  }, [form.name, isEdit, navigate]);

  const handleSaveAndNew = useCallback(() => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên chương trình.");
      return;
    }
    toast.success("Đã tạo chương trình mới.");
    setForm(buildInitialFormState());
    setActiveTab("km");
  }, [form.name]);

  const handleCancel = useCallback(() => {
    navigate("/promotions/programs");
  }, [navigate]);

  const isInvoiceDiscount = promotionType === "INVOICE_DISCOUNT";
  const isProductDiscount = promotionType === "PRODUCT_DISCOUNT";
  const isTieredDiscount = promotionType === "TIERED_DISCOUNT";
  const isGiftDiscount = promotionType === "GIFT";
  const isSupported =
    isInvoiceDiscount ||
    isProductDiscount ||
    isTieredDiscount ||
    isGiftDiscount;

  return (
    <AdminPageShell>
      <PageHeader
        title={isEdit ? "Sửa chương trình khuyến mãi" : "Thêm mới chương trình khuyến mãi"}
      />
      <FormActionBar
        position="top"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
      />
      {isTieredDiscount ? null : (
        <Tabs tabs={FORM_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {!isSupported ? (
          <div className="py-10 text-sm text-muted-foreground">
            Loại khuyến mãi này đang được phát triển.
          </div>
        ) : isTieredDiscount ? (
          <div className="max-w-5xl flex flex-col gap-5">
            <GeneralInfoSection form={form} onChange={onChange} />
            <TimeSection form={form} onChange={onChange} />
            {isChain ? <StoreScopeSection form={form} onChange={onChange} /> : null}
            <TieredDiscountSection form={form} onChange={onChange} />
          </div>
        ) : activeTab === "km" ? (
          <div className="max-w-5xl flex flex-col gap-5">
            <GeneralInfoSection form={form} onChange={onChange} />
            <TimeSection form={form} onChange={onChange} />
            {isChain ? <StoreScopeSection form={form} onChange={onChange} /> : null}
            {isInvoiceDiscount ? (
              <>
                <ApplyScopeSection form={form} onChange={onChange} />
                <DiscountSection form={form} onChange={onChange} />
              </>
            ) : isProductDiscount ? (
              <GoodsDiscountSection form={form} onChange={onChange} />
            ) : (
              <GiftSection form={form} onChange={onChange} />
            )}
          </div>
        ) : (
          <div className="max-w-5xl flex flex-col gap-5">
            <ConditionSection
              form={form}
              onChange={onChange}
              showGiftMultiplier={isGiftDiscount}
            />
            <ApplicableGoodsTable
              value={form.applicableGoods}
              onChange={(goods) => onChange({ applicableGoods: goods })}
            />
            <AutoApplyCheckbox
              checked={form.autoApply}
              onChange={(v) => onChange({ autoApply: v })}
            />
          </div>
        )}
      </div>

      <FormActionBar
        position="bottom"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
      />
    </AdminPageShell>
  );
}

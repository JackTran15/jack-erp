import { useMemo } from "react";
import type {
  SampleDerivedTotals,
  SampleInvoiceDraft,
  SampleInvoiceLine,
  SampleInvoicePayment,
} from "@erp/pos/interfaces/print-sample-invoice.interface";
import { deriveSampleTotals } from "@erp/pos/lib/page-libs/print-settings/sampleInvoiceDraft";
import { usePosPrintSampleInvoiceStore } from "@erp/pos/stores/common/print-sample-invoice.store";
import type {
  SampleDerivedFieldKey,
  SampleDocType,
  SampleFieldKey,
  SampleNumberFieldKey,
  SampleTextFieldKey,
} from "@erp/pos/types/print-sample-invoice.type";

export interface UseSampleInvoiceResult {
  draft: SampleInvoiceDraft;
  /** Bộ số tự tính (đã áp ghi đè) — dùng để hiển thị ô read-only. */
  derived: SampleDerivedTotals;
  setText: (key: SampleTextFieldKey, value: string) => void;
  setNumber: (key: SampleNumberFieldKey, value: number) => void;
  setEnabled: (key: SampleFieldKey, enabled: boolean) => void;
  enableAllFields: () => void;
  /** True khi mọi thành phần đã bật — dùng để khóa nút "Hiện tất cả". */
  isAllEnabled: boolean;
  setDocType: (docType: SampleDocType) => void;
  setOverride: (key: SampleDerivedFieldKey, value: number) => void;
  clearOverride: (key: SampleDerivedFieldKey) => void;
  addLine: () => void;
  updateLine: (id: string, patch: Partial<Omit<SampleInvoiceLine, "id">>) => void;
  removeLine: (id: string) => void;
  addPayment: () => void;
  updatePayment: (
    id: string,
    patch: Partial<Omit<SampleInvoicePayment, "id">>,
  ) => void;
  removePayment: (id: string) => void;
  resetDraft: () => void;
}

/**
 * State + hành động của editor nội dung hóa đơn mẫu ở `/cai-dat-in`.
 * Preview và "In thử" đọc cùng store này nên sửa tới đâu thấy tới đó.
 */
export const useSampleInvoice = (): UseSampleInvoiceResult => {
  const draft = usePosPrintSampleInvoiceStore((s) => s.draft);
  const setText = usePosPrintSampleInvoiceStore((s) => s.setText);
  const setNumber = usePosPrintSampleInvoiceStore((s) => s.setNumber);
  const setEnabled = usePosPrintSampleInvoiceStore((s) => s.setEnabled);
  const enableAllFields = usePosPrintSampleInvoiceStore(
    (s) => s.enableAllFields,
  );
  const setDocType = usePosPrintSampleInvoiceStore((s) => s.setDocType);
  const setOverride = usePosPrintSampleInvoiceStore((s) => s.setOverride);
  const clearOverride = usePosPrintSampleInvoiceStore((s) => s.clearOverride);
  const addLine = usePosPrintSampleInvoiceStore((s) => s.addLine);
  const updateLine = usePosPrintSampleInvoiceStore((s) => s.updateLine);
  const removeLine = usePosPrintSampleInvoiceStore((s) => s.removeLine);
  const addPayment = usePosPrintSampleInvoiceStore((s) => s.addPayment);
  const updatePayment = usePosPrintSampleInvoiceStore((s) => s.updatePayment);
  const removePayment = usePosPrintSampleInvoiceStore((s) => s.removePayment);
  const resetDraft = usePosPrintSampleInvoiceStore((s) => s.resetDraft);

  const derived = useMemo(() => deriveSampleTotals(draft), [draft]);
  const isAllEnabled = useMemo(
    () => Object.values(draft.enabled).every(Boolean),
    [draft.enabled],
  );

  return {
    draft,
    derived,
    setText,
    setNumber,
    setEnabled,
    enableAllFields,
    isAllEnabled,
    setDocType,
    setOverride,
    clearOverride,
    addLine,
    updateLine,
    removeLine,
    addPayment,
    updatePayment,
    removePayment,
    resetDraft,
  };
};

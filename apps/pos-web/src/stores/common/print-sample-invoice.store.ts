import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SAMPLE_INVOICE_DRAFT_DEFAULTS } from "@erp/pos/constants/print-sample-invoice.constant";
import type {
  SampleInvoiceDraft,
  SampleInvoiceLine,
  SampleInvoicePayment,
} from "@erp/pos/interfaces/print-sample-invoice.interface";
import type {
  SampleDerivedFieldKey,
  SampleDocType,
  SampleFieldKey,
  SampleNumberFieldKey,
  SampleTextFieldKey,
} from "@erp/pos/types/print-sample-invoice.type";

const STORAGE_KEY = "pos-print-sample-invoice";
const STORE_VERSION = 1;

function cloneDefaults(): SampleInvoiceDraft {
  const d = SAMPLE_INVOICE_DRAFT_DEFAULTS;
  return {
    docType: d.docType,
    texts: { ...d.texts },
    numbers: { ...d.numbers },
    enabled: { ...d.enabled },
    overrides: { ...d.overrides },
    lines: d.lines.map((l) => ({ ...l })),
    payments: d.payments.map((p) => ({ ...p })),
  };
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

interface PosPrintSampleInvoiceState {
  version: number;
  draft: SampleInvoiceDraft;

  setText: (key: SampleTextFieldKey, value: string) => void;
  setNumber: (key: SampleNumberFieldKey, value: number) => void;
  setEnabled: (key: SampleFieldKey, enabled: boolean) => void;
  /** Bật hết mọi thành phần — xem một lượt hóa đơn có những gì. */
  enableAllFields: () => void;
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
 * Nội dung hóa đơn mẫu của trang `/cai-dat-in` — cấu hình THEO MÁY
 * (localStorage), không đồng bộ lên server, giống thông số layout ở
 * `print-settings.store.ts`. Đây chỉ là dữ liệu để xem trước và in thử, không
 * dính gì tới hóa đơn thật.
 */
export const usePosPrintSampleInvoiceStore =
  create<PosPrintSampleInvoiceState>()(
    persist(
      (set) => ({
        version: STORE_VERSION,
        draft: cloneDefaults(),

        setText: (key, value) =>
          set((s) => ({
            draft: { ...s.draft, texts: { ...s.draft.texts, [key]: value } },
          })),

        setNumber: (key, value) =>
          set((s) => ({
            draft: { ...s.draft, numbers: { ...s.draft.numbers, [key]: value } },
          })),

        setEnabled: (key, enabled) =>
          set((s) => ({
            draft: { ...s.draft, enabled: { ...s.draft.enabled, [key]: enabled } },
          })),

        enableAllFields: () =>
          set((s) => ({
            draft: {
              ...s.draft,
              enabled: Object.fromEntries(
                Object.keys(s.draft.enabled).map((key) => [key, true]),
              ) as SampleInvoiceDraft["enabled"],
            },
          })),

        setDocType: (docType) =>
          set((s) => ({ draft: { ...s.draft, docType } })),

        setOverride: (key, value) =>
          set((s) => ({
            draft: {
              ...s.draft,
              overrides: { ...s.draft.overrides, [key]: value },
            },
          })),

        clearOverride: (key) =>
          set((s) => {
            const next = { ...s.draft.overrides };
            delete next[key];
            return { draft: { ...s.draft, overrides: next } };
          }),

        addLine: () =>
          set((s) => ({
            draft: {
              ...s.draft,
              lines: [
                ...s.draft.lines,
                {
                  id: newId("line"),
                  name: "Hàng hóa mới",
                  qty: 1,
                  unitPrice: 0,
                  lineTotal: null,
                  discountLabel: "",
                  note: "",
                },
              ],
            },
          })),

        updateLine: (id, patch) =>
          set((s) => ({
            draft: {
              ...s.draft,
              lines: s.draft.lines.map((l) =>
                l.id === id ? { ...l, ...patch } : l,
              ),
            },
          })),

        removeLine: (id) =>
          set((s) => ({
            draft: {
              ...s.draft,
              lines: s.draft.lines.filter((l) => l.id !== id),
            },
          })),

        addPayment: () =>
          set((s) => ({
            draft: {
              ...s.draft,
              payments: [
                ...s.draft.payments,
                { id: newId("payment"), label: "Tiền mặt", amount: 0 },
              ],
            },
          })),

        updatePayment: (id, patch) =>
          set((s) => ({
            draft: {
              ...s.draft,
              payments: s.draft.payments.map((p) =>
                p.id === id ? { ...p, ...patch } : p,
              ),
            },
          })),

        removePayment: (id) =>
          set((s) => ({
            draft: {
              ...s.draft,
              payments: s.draft.payments.filter((p) => p.id !== id),
            },
          })),

        resetDraft: () => set({ draft: cloneDefaults() }),
      }),
      {
        name: STORAGE_KEY,
        version: STORE_VERSION,
        partialize: (state) => ({ version: state.version, draft: state.draft }),
        // Spread mặc định TRƯỚC rồi mới overlay giá trị đã lưu: thêm field mới
        // ở bản sau không làm vỡ dữ liệu cũ (field thiếu tự lấy mặc định), nên
        // không cần bump version mỗi lần bổ sung thành phần hóa đơn.
        merge: (persisted, current) => {
          const saved = persisted as
            | Partial<PosPrintSampleInvoiceState>
            | undefined;
          const d = saved?.draft;
          const base = cloneDefaults();
          return {
            ...(current as PosPrintSampleInvoiceState),
            version: STORE_VERSION,
            draft: {
              docType: d?.docType ?? base.docType,
              texts: { ...base.texts, ...d?.texts },
              numbers: { ...base.numbers, ...d?.numbers },
              enabled: { ...base.enabled, ...d?.enabled },
              overrides: { ...d?.overrides },
              lines: d?.lines ?? base.lines,
              payments: d?.payments ?? base.payments,
            },
          };
        },
      },
    ),
  );

/** Đọc draft ngoài React — dùng khi in thử để lấy đúng nội dung mới nhất. */
export function getSampleInvoiceDraft(): SampleInvoiceDraft {
  return usePosPrintSampleInvoiceStore.getState().draft;
}

// Trang cài đặt mở ở TAB RIÊNG, mà zustand/persist không tự đồng bộ giữa các
// tab — bám đúng cách `print-settings.store.ts` xử lý.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    void usePosPrintSampleInvoiceStore.persist.rehydrate();
  });
}

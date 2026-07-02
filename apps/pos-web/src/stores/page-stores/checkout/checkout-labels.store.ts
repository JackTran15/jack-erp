import { create } from "zustand";

export interface LabelTag {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_LABEL_COLOR = "#F8D14E";

const initialLabels = (): LabelTag[] => [
  { id: "l-gap", name: "Gấp", color: DEFAULT_LABEL_COLOR },
];

/**
 * Định nghĩa nhãn dùng CHUNG cho mọi hóa đơn (toàn cục). Nhãn ĐÃ GÁN cho từng
 * đơn (`selectedLabelIds`) là per-tab và nằm trong `InvoiceSession.draft.labels`
 * (xem checkout-session.store) — hook `useCheckoutLabels` ghép 2 nguồn này.
 */
interface PosCheckoutLabelsState {
  labels: LabelTag[];
  addLabel: (name: string) => LabelTag;
  updateLabel: (
    id: string,
    patch: Partial<Pick<LabelTag, "name" | "color">>,
  ) => void;
  deleteLabel: (id: string) => void;
  resetLabels: () => void;
}

function generateLabelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePosCheckoutLabelsStore = create<PosCheckoutLabelsState>()(
  (set) => ({
    labels: initialLabels(),

    addLabel: (name) => {
      const trimmed = name.trim();
      const next: LabelTag = {
        id: generateLabelId(),
        name: trimmed,
        color: DEFAULT_LABEL_COLOR,
      };
      set((state) => ({ labels: [...state.labels, next] }));
      return next;
    },

    updateLabel: (id, patch) =>
      set((state) => ({
        labels: state.labels.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      })),

    deleteLabel: (id) =>
      set((state) => ({
        labels: state.labels.filter((l) => l.id !== id),
      })),

    resetLabels: () => set({ labels: initialLabels() }),
  }),
);
